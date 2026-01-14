import cors from "cors";
import express from "express";
import routes from "./routes";

process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 UNHANDLED REJECTION:", reason);
});

const app = express();

app.use(cors());
app.use(express.json());
app.use(routes);

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Gateway] Server running on port ${PORT}`);
});
