import { db } from "./db";
import { robotQueueSettings, robotQueueItems, robots, conversations, contacts, whatsappAccounts } from "@shared/schema";
import type { RobotQueueSettings, RobotQueueItem, QueueStatus } from "@shared/schema";
import { eq, and, desc, asc, sql, count } from "drizzle-orm";
import { robotEngine } from "./robot-engine";
import { Server as SocketIOServer } from "socket.io";

const logger = {
  info: (data: any, msg?: string) => console.log(`[RobotQueue] ${msg || ""}`, data),
  warn: (data: any, msg?: string) => console.warn(`[RobotQueue] ${msg || ""}`, data),
  error: (data: any, msg?: string) => console.error(`[RobotQueue] ${msg || ""}`, data),
  debug: (data: any, msg?: string) => console.log(`[RobotQueue] ${msg || ""}`, data),
};

interface QueueProcessor {
  isRunning: boolean;
  nextProcessAt: Date | null;
  intervalId: NodeJS.Timeout | null;
}

class RobotQueueManager {
  private processors: Map<string, QueueProcessor> = new Map();
  private io: SocketIOServer | null = null;

  setSocketIO(io: SocketIOServer) {
    this.io = io;
  }

  private emitQueueUpdate(companyId: string, data: any) {
    if (this.io) {
      this.io.to(`company:${companyId}`).emit("queue:update", data);
    }
  }

  async getSettings(companyId: string): Promise<RobotQueueSettings> {
    const [settings] = await db.select().from(robotQueueSettings)
      .where(eq(robotQueueSettings.companyId, companyId));
    
    if (settings) return settings;

    const [newSettings] = await db.insert(robotQueueSettings).values({
      companyId,
      delayBetweenContacts: 30,
      isQueueActive: true,
      maxConcurrentSessions: 1,
    }).returning();

    return newSettings;
  }

  async updateSettings(companyId: string, data: Partial<RobotQueueSettings>): Promise<RobotQueueSettings> {
    await this.getSettings(companyId);

    const [updated] = await db.update(robotQueueSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(robotQueueSettings.companyId, companyId))
      .returning();

    return updated;
  }

  async addToQueue(
    companyId: string,
    robotId: string,
    conversationId: string,
    contactId: string,
    requestedBy?: string,
    priority: number = 0
  ): Promise<RobotQueueItem> {
    const pendingItems = await db.select({ count: count() })
      .from(robotQueueItems)
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "pending")
      ));

    const position = (pendingItems[0]?.count || 0) + 1;

    const [item] = await db.insert(robotQueueItems).values({
      companyId,
      robotId,
      conversationId,
      contactId,
      requestedBy,
      priority,
      position,
      status: "pending",
    }).returning();

    logger.info({ companyId, robotId, conversationId, position }, "Item adicionado à fila");

    this.emitQueueUpdate(companyId, {
      type: "item_added",
      item,
    });

    this.startProcessor(companyId);

    return item;
  }

  async getQueueItems(companyId: string, status?: string): Promise<RobotQueueItem[]> {
    const conditions = [eq(robotQueueItems.companyId, companyId)];
    
    if (status) {
      conditions.push(eq(robotQueueItems.status, status));
    }

    return db.select().from(robotQueueItems)
      .where(and(...conditions))
      .orderBy(desc(robotQueueItems.priority), asc(robotQueueItems.position));
  }

  async getQueueStatus(companyId: string): Promise<QueueStatus> {
    const settings = await this.getSettings(companyId);
    const processor = this.processors.get(companyId);

    const [currentItem] = await db.select().from(robotQueueItems)
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "processing")
      ))
      .limit(1);

    const [pendingResult] = await db.select({ count: count() })
      .from(robotQueueItems)
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "pending")
      ));

    const [completedResult] = await db.select({ count: count() })
      .from(robotQueueItems)
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "completed")
      ));

    const [failedResult] = await db.select({ count: count() })
      .from(robotQueueItems)
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "failed")
      ));

    return {
      isProcessing: processor?.isRunning || false,
      currentItem: currentItem || null,
      pendingCount: pendingResult?.count || 0,
      completedCount: completedResult?.count || 0,
      failedCount: failedResult?.count || 0,
      delayBetweenContacts: settings.delayBetweenContacts,
      nextProcessAt: processor?.nextProcessAt || null,
    };
  }

  async cancelQueueItem(itemId: string): Promise<RobotQueueItem | null> {
    const [item] = await db.select().from(robotQueueItems)
      .where(eq(robotQueueItems.id, itemId));

    if (!item) return null;

    if (item.status === "processing") {
      robotEngine.cancelExecution(item.conversationId);
    }

    const [updated] = await db.update(robotQueueItems)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(eq(robotQueueItems.id, itemId))
      .returning();

    this.emitQueueUpdate(item.companyId, {
      type: "item_cancelled",
      item: updated,
    });

    return updated;
  }

  async clearQueue(companyId: string): Promise<number> {
    const pending = await db.select().from(robotQueueItems)
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "pending")
      ));

    await db.update(robotQueueItems)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "pending")
      ));

    this.emitQueueUpdate(companyId, {
      type: "queue_cleared",
      count: pending.length,
    });

    return pending.length;
  }

  private async startProcessor(companyId: string) {
    let processor = this.processors.get(companyId);
    
    if (processor?.isRunning) {
      return;
    }

    processor = {
      isRunning: true,
      nextProcessAt: null,
      intervalId: null,
    };
    this.processors.set(companyId, processor);

    this.processQueue(companyId);
  }

  private async processQueue(companyId: string) {
    const processor = this.processors.get(companyId);
    if (!processor) return;

    const settings = await this.getSettings(companyId);
    
    if (!settings.isQueueActive) {
      processor.isRunning = false;
      return;
    }

    const [processingItem] = await db.select().from(robotQueueItems)
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "processing")
      ))
      .limit(1);

    if (processingItem) {
      setTimeout(() => this.processQueue(companyId), 5000);
      return;
    }

    const [nextItem] = await db.select().from(robotQueueItems)
      .where(and(
        eq(robotQueueItems.companyId, companyId),
        eq(robotQueueItems.status, "pending")
      ))
      .orderBy(desc(robotQueueItems.priority), asc(robotQueueItems.position))
      .limit(1);

    if (!nextItem) {
      processor.isRunning = false;
      processor.nextProcessAt = null;
      this.emitQueueUpdate(companyId, { type: "queue_empty" });
      return;
    }

    await db.update(robotQueueItems)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(robotQueueItems.id, nextItem.id));

    this.emitQueueUpdate(companyId, {
      type: "item_processing",
      item: { ...nextItem, status: "processing", startedAt: new Date() },
    });

    try {
      const [conversation] = await db.select().from(conversations)
        .where(eq(conversations.id, nextItem.conversationId));
      
      const [contact] = await db.select().from(contacts)
        .where(eq(contacts.id, nextItem.contactId));
      
      if (!conversation || !contact) {
        throw new Error("Conversa ou contato não encontrado");
      }

      const [robot] = await db.select().from(robots)
        .where(eq(robots.id, nextItem.robotId));

      if (!robot) {
        throw new Error("Robô não encontrado");
      }

      const { whatsappBaileys } = await import("./whatsapp-baileys");

      const sendMessage = async (convId: string, content: string, mediaType?: string, mediaUrl?: string) => {
        if (mediaType && mediaUrl) {
          await whatsappBaileys.sendMessage(conversation.whatsappAccountId, contact.phoneNumber, content, undefined, {
            mediaUrl,
            mediaType: mediaType as "image" | "audio" | "video" | "document",
          });
        } else {
          await whatsappBaileys.sendMessage(conversation.whatsappAccountId, contact.phoneNumber, content);
        }
      };

      const sendPresence = async (whatsappAccountId: string, contactPhone: string, type: "composing" | "recording" | "paused") => {
        await whatsappBaileys.sendPresenceUpdate(whatsappAccountId, contactPhone, type);
      };

      const result = await robotEngine.executeRobot(
        nextItem.robotId,
        {
          conversationId: nextItem.conversationId,
          contactId: nextItem.contactId,
          contactName: contact.name,
          contactPhone: contact.phoneNumber,
          whatsappAccountId: conversation.whatsappAccountId,
          companyId,
          executedBy: nextItem.requestedBy || undefined,
        },
        sendMessage,
        sendPresence,
        (progressData) => {
          this.emitQueueUpdate(companyId, {
            type: "item_progress",
            itemId: nextItem.id,
            progress: progressData,
          });
        }
      );

      if (result.success) {
        await db.update(robotQueueItems)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(robotQueueItems.id, nextItem.id));

        this.emitQueueUpdate(companyId, {
          type: "item_completed",
          item: { ...nextItem, status: "completed", completedAt: new Date() },
        });
      } else {
        await db.update(robotQueueItems)
          .set({ status: "failed", error: result.error, completedAt: new Date() })
          .where(eq(robotQueueItems.id, nextItem.id));

        this.emitQueueUpdate(companyId, {
          type: "item_failed",
          item: { ...nextItem, status: "failed", error: result.error },
        });
      }
    } catch (error: any) {
      logger.error({ itemId: nextItem.id, error: error.message }, "Erro ao processar item da fila");

      await db.update(robotQueueItems)
        .set({ status: "failed", error: error.message, completedAt: new Date() })
        .where(eq(robotQueueItems.id, nextItem.id));

      this.emitQueueUpdate(companyId, {
        type: "item_failed",
        item: { ...nextItem, status: "failed", error: error.message },
      });
    }

    const delayMs = settings.delayBetweenContacts * 1000;
    processor.nextProcessAt = new Date(Date.now() + delayMs);

    this.emitQueueUpdate(companyId, {
      type: "waiting_delay",
      nextProcessAt: processor.nextProcessAt,
      delaySeconds: settings.delayBetweenContacts,
    });

    logger.info({ companyId, delaySeconds: settings.delayBetweenContacts }, "Aguardando delay anti-spam");

    setTimeout(() => this.processQueue(companyId), delayMs);
  }

  async getQueueHistory(companyId: string, limit: number = 50): Promise<RobotQueueItem[]> {
    return db.select().from(robotQueueItems)
      .where(eq(robotQueueItems.companyId, companyId))
      .orderBy(desc(robotQueueItems.createdAt))
      .limit(limit);
  }
}

export const robotQueueManager = new RobotQueueManager();
