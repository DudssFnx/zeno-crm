import cors from "cors";
import express from "express";
import routes from "./routes";

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 AQUI ESTÁ O PONTO CRÍTICO
app.use(routes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[Gateway] Server running on port ${PORT}`);
});
