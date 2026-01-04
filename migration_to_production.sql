-- MIGRATION SCRIPT: Development -> Production
-- Company: LOJAMADRUGADAO
-- Generated: 2026-01-04
-- 
-- INSTRUCTIONS:
-- 1. First, create your account in production (using the Register button)
-- 2. Note your NEW company_id from production
-- 3. Replace ALL occurrences of '888f0d44-a83f-4b6d-8d2c-ad700ddf983f' with your NEW production company_id
-- 4. Replace the whatsapp_account_id '7ddbf6c1-af8b-4d83-b841-65f1184b28ad' with your NEW production whatsapp account id
-- 5. Run this SQL in the Production database (use Database panel > Production)

-- =====================================================
-- CONTACT ATTRIBUTES (Atributos de Contato)
-- =====================================================
INSERT INTO contact_attributes (id, company_id, name, color, display_order, created_at, updated_at) VALUES
('30f44e35-48a1-4055-a0a3-cbd27944bf96', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🚚 LALAMOVE', '#F59E0B', 0, NOW(), NOW()),
('9ee317a8-8d88-40a4-9f30-28e89efaf6a7', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '📦 ONLOG', '#3B82F6', 1, NOW(), NOW()),
('8552be43-964c-4f27-8da0-628daac3e809', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🏬 RETIRA NA LOJA', '#10B981', 3, NOW(), NOW()),
('ab8ff46b-b8bf-43af-8350-de433e854318', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🏤 TRANSPORTADORA', '#F97316', 2, NOW(), NOW()),
('e8775b6f-7f58-4080-9e57-c1e8700d61d6', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🚌 ENVIO DE ONIBUS', '#EC4899', 4, NOW(), NOW()),
('ba3ad03a-6807-49c9-92e3-4bf27c0ef985', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '👥Cliente ativo', '#10B981', 5, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- TAGS (Etiquetas)
-- =====================================================
INSERT INTO tags (id, company_id, name, color, created_at, updated_at) VALUES
('48023b7f-01d6-4834-8347-a4954ea87c07', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🛎️ FILA', '#6366F1', NOW(), NOW()),
('7aa863f6-a66c-4f1b-ae7a-4b93b5684c3d', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '❗ EM ABERTO', '#7DD3FC', NOW(), NOW()),
('a28e27b5-d621-4ef6-a46c-68afca4f3e61', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🛒 SEPARADO', '#000000', NOW(), NOW()),
('802039fa-98ce-4bee-ba75-4b3e8ffd3cb5', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', 'LEAD VELHO', '#9CA3AF', NOW(), NOW()),
('2e5f28d4-d65a-443f-bc28-99b8c64a0dbc', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🚨 PÓS VENDAS', '#EF4444', NOW(), NOW()),
('6dea9b32-7f23-43a4-bef6-2f13b4d2a828', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🧾 CONFERIR COMPROVANTE', '#6B7280', NOW(), NOW()),
('c58fbedb-c43e-421e-9321-61d55cfa3b4b', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '🤝 PEDIDO COBRADO', '#00CED1', NOW(), NOW()),
('b7c13f21-b777-430c-b067-015723adade2', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '📦 AGUARDANDO ENVIO', '#EAB308', NOW(), NOW()),
('4f32bcd4-859e-4efd-9b03-60765dc11c0c', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '📄 CONFERENCIA', '#BEF264', NOW(), NOW()),
('43a31edf-4d90-486c-9c79-74de533b23c9', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '👨‍💼 LEAD NOVO', '#F59E0B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- MACROS (Atalhos de Automação)
-- =====================================================
INSERT INTO macros (id, company_id, name, description, message_template, actions, is_global, created_at, updated_at, sort_order) VALUES
('9ed93c99-1cdc-4d81-9fcd-73f2ae2c9a0b', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '1 - COBRADO', 'PROXIMO PASSO CONFERIR COMPROVANTE', 'Estamos aguardando a confirmação do pagamento para prosseguirmos com o envio do seu pedido.', '[{"type": "REMOVE_ALL_TAGS", "tagId": "b8cf2ad7-e6e5-4644-9f18-7f4390ff4305"}, {"type": "ADD_TAG", "tagId": "c58fbedb-c43e-421e-9321-61d55cfa3b4b"}]', true, NOW(), NOW(), 0),
('172e3ac4-fca1-4281-9537-af3178ddd586', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '2 - CONFERIR COMPROVANTE', 'PROXIMO PASSO CONFERENCIA', 'Agradecemos pelo pagamento! Nossa equipe financeira já está verificando se está tudo certinho e, em breve, daremos sequência ao envio do seu pedido.', '[{"type": "REMOVE_ALL_TAGS", "tagId": "b8cf2ad7-e6e5-4644-9f18-7f4390ff4305"}, {"type": "ADD_TAG", "tagId": "6dea9b32-7f23-43a4-bef6-2f13b4d2a828"}]', true, NOW(), NOW(), 1),
('6e60cdc0-dc41-4dcc-b375-b56c31beca76', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '3 - COMPROVANTE CONFERIDO', 'PROXIMO PASSO CONFERIR MERCADORIA E ENVIAR', E'Seu pagamento foi conferido com sucesso!\nSeu pedido já está sendo encaminhado para o setor logístico e será enviado ainda hoje. 📦✅', '[{"type": "REMOVE_ALL_TAGS", "tagId": "ef0e2977-46ea-433f-a772-c3b0223047bf"}, {"type": "ADD_TAG", "tagId": "4f32bcd4-859e-4efd-9b03-60765dc11c0c"}]', true, NOW(), NOW(), 2),
('cb521a25-3634-425b-b8a6-342f90788011', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '4 - PEDIDO CONFERIDO', 'CONFERIR PEDIDOS PARA ENVIAR', 'Seu pedido foi conferido com todo o cuidado e, agora, será enviado. 📦🚚', '[{"type": "REMOVE_ALL_TAGS"}, {"type": "ADD_TAG", "tagId": "b7c13f21-b777-430c-b067-015723adade2"}]', true, NOW(), NOW(), 3),
('231542fb-5be6-4aec-8b31-af260481cd6e', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '5 - PEDIDO ENVIADO', 'ENVIAR RASTREIO ANTES DE FINALIZAR', E'Seu pedido já foi enviado! 📦🚚\nAgradecemos muito pela sua compra.\n\nSe puder, gostaríamos de convidar você para participar do nosso grupo de WhatsApp, onde compartilhamos novidades e ofertas exclusivas:\nhttps://chat.whatsapp.com/FCW3OX50fVSCDZv8wqpUhx\n\nMais uma vez, muito obrigado pelo seu pedido!', '[{"type": "REMOVE_ALL_TAGS"}, {"type": "SET_ATTRIBUTE", "attribute": "👥Cliente ativo"}]', true, NOW(), NOW(), 4),
('d4b0d524-08fa-48ca-b204-120de5c48477', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', 'SAIR FILA', '', E'{{nome}} Estou finalizando seu atendimento.\nobrigado', '[{"type": "REMOVE_TAG", "tagId": "48023b7f-01d6-4834-8347-a4954ea87c07"}]', true, NOW(), NOW(), 5)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- TRIAGE MENUS (Menus de Triagem)
-- IMPORTANT: Replace whatsapp_account_id with your production WhatsApp account ID!
-- =====================================================
INSERT INTO triage_menus (id, company_id, whatsapp_account_id, name, welcome_message, options, invalid_message, timeout_minutes, is_active, trigger_on_first_message, created_at, updated_at) VALUES
('09893b34-6986-4cc4-a8b6-941c3ddcd0e9', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '7ddbf6c1-af8b-4d83-b841-65f1184b28ad', 'Menu Principal Loja Madrugadão', E'Olá! Bem-vindo ao atendimento da LOJA MADRUGADÃO!\nPor favor, digite o número da opção desejada:', '[{"key": "1", "label": "Já sou cliente", "tagId": "48023b7f-01d6-4834-8347-a4954ea87c07", "stageId": "", "keywords": [], "response": "Perfeito! Você já é nosso cliente. Estou direcionando você para o atendimento. Por favor, aguarde um instante.", "departmentId": ""}, {"key": "2", "label": "Como comprar no atacado", "tagId": "43a31edf-4d90-486c-9c79-74de533b23c9", "stageId": "", "keywords": ["atacado", "atacadista", "revenda"], "response": "Você deseja comprar no atacado? Estou direcionando você para o nosso time comercial. Por favor, aguarde um instante.", "departmentId": ""}, {"key": "3", "label": "Pós-vendas", "tagId": "2e5f28d4-d65a-443f-bc28-99b8c64a0dbc", "stageId": "", "keywords": ["problema", "defeito", "troca", "devolução"], "response": "Entendi que você precisa de suporte pós-vendas. Estou direcionando você para o nosso time de pós-vendas para ajudar da melhor forma.", "departmentId": ""}, {"key": "4", "label": "Comprar no varejo", "tagId": "", "stageId": "", "keywords": ["varejo", "unidade", "uma unidade"], "response": "Você deseja comprar no varejo? Acesse nossa loja online: www.lojamadrugadao.com ou aguarde para falar com um atendente.", "departmentId": ""}]', 'Opção inválida. Por favor, digite um número de 1 a 4.', 30, true, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- ROBOTS (Robôs de Automação)
-- NOTE: Audio files need to be uploaded separately to production
-- =====================================================
INSERT INTO robots (id, company_id, name, description, actions, is_active, created_at, updated_at) VALUES
('bd2c9383-60e1-4518-826e-a8df47d38bee', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', 'LEAD NOVO ATACADO', 'ENVIAR PARA CLIENTES NOVOS DE ATACADO', '[{"id": "4bc4bbfb-3633-457c-ba6c-f66f48196f6b", "type": "remove_all_tags"}, {"id": "43036a3a-c779-4df5-9dc6-0b66e82d574c", "type": "simulate_typing", "delayMs": 11000}, {"id": "918aaee8-64a2-4a63-885a-a514c5cf4112", "type": "send_text", "content": "Oi, tudo bem?\nMeu nome é Mike e sou o responsável pela parte de atacado."}, {"id": "2b5c838c-dfda-43dd-ad5c-f1a6cebd83ae", "type": "delay", "delayMs": 6000}, {"id": "10c1a51a-0c16-4c8f-bc17-85f8de06ddad", "type": "simulate_recording", "delayMs": 12000}, {"id": "327a56d7-e07f-44d0-9f13-ec14074eb515", "type": "send_audio", "fileName": "WhatsApp Ptt 2026-01-03 at 17.34.53 (1).ogg", "mediaUrl": "/uploads/888f0d44-a83f-4b6d-8d2c-ad700ddf983f/1767531200221_whatsapp_ptt_2026_01_03_at_17.34.53__1_.ogg"}, {"id": "d1864fe1-6f2d-4128-9079-c7a7d7bbb1d8", "type": "send_text", "content": "https://chat.whatsapp.com/FCW3OX50fVSCDZv8wqpUhx"}, {"id": "36efd50d-8e2d-4e88-96e0-b95f63089326", "type": "simulate_recording", "delayMs": 20000}, {"id": "39827274-1b70-42c5-8582-0665c755ec52", "type": "send_audio", "fileName": "WhatsApp Ptt 2026-01-03 at 17.48.42 (2).ogg", "mediaUrl": "/uploads/888f0d44-a83f-4b6d-8d2c-ad700ddf983f/1767531230798_whatsapp_ptt_2026_01_03_at_17.48.42__2_.ogg"}, {"id": "7dc80f33-fcc9-415f-8b26-d5dd0378a0ce", "type": "simulate_typing", "delayMs": 7000}, {"id": "7e7913bb-cb83-48ff-a0fb-ed7d2f9d199b", "type": "send_text", "content": "https://lojamadrugadao.mercos.com/solicitar-acesso"}, {"id": "4d5bce91-1e96-4e46-9109-67e11bb1815c", "type": "simulate_recording", "delayMs": 25000}, {"id": "dc1f4d57-1945-4325-a96c-c86d649d94c7", "type": "send_audio", "fileName": "WhatsApp Ptt 2026-01-03 at 17.48.42 (3).ogg", "mediaUrl": "/uploads/888f0d44-a83f-4b6d-8d2c-ad700ddf983f/1767531269150_whatsapp_ptt_2026_01_03_at_17.48.42__3_.ogg"}, {"id": "259c3c95-e424-47fe-b455-ed32410b92cb", "type": "add_tag", "tagId": "802039fa-98ce-4bee-ba75-4b3e8ffd3cb5"}]', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- CANNED RESPONSES (Respostas Rápidas)
-- =====================================================
INSERT INTO canned_responses (id, company_id, shortcut, content, created_at, attributes, tag_ids) VALUES
('9e01f977-4764-44bc-9782-d69c2ab80fb8', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '/onlog', 'seu pedido foi enviado pala Onlog', NOW(), '{"📦 ONLOG"}', NULL),
('ff766210-84a1-42be-9ebf-ea7950ab05b5', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', 'onibus', 'seu pedido foi enviado pelo ônibus', NOW(), '{"🚌 ENVIO DE ONIBUS"}', NULL),
('94645ae9-c014-4e3a-823d-e95dafd809e0', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', 'retira', 'aguardo você retirar na loja', NOW(), '{"🏬 RETIRA NA LOJA"}', NULL),
('3a4ffbb0-9a8d-42ac-9dac-f317da1cd701', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', '/lalamove', 'seu pedido foi enviado por lalamove', NOW(), '{"🚚 LALAMOVE"}', NULL),
('e7b8355d-1d37-49a8-8d92-66078c4673b9', '888f0d44-a83f-4b6d-8d2c-ad700ddf983f', 'separado', 'Seu pedido foi separado com todo o cuidado e atenção. Segue o romaneio e, em alguns instantes, envio o valor total já com o frete.', NOW(), NULL, '{a28e27b5-d621-4ef6-a46c-68afca4f3e61}')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
-- After running this SQL:
-- 1. Connect your WhatsApp in production (scan QR code)
-- 2. Update the triage_menus whatsapp_account_id if needed
-- 3. Re-upload audio files for Robot automation
-- =====================================================
