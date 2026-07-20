import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";

import authRouter from "./routes/auth";
import branchesRouter from "./routes/branches";
import studentsRouter from "./routes/students";
import paymentsRouter from "./routes/payments";
import expensesRouter from "./routes/expenses";
import transportRouter from "./routes/transport";
import inventoryRouter from "./routes/inventory";
import usersRouter from "./routes/users";
import dashboardRouter from "./routes/dashboard";
import feeTemplatesRouter from "./routes/feeTemplates";
import reportsRouter from "./routes/reports";
import academicYearsRouter from "./routes/academicYears";

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "127.0.0.1";
const frontendUrl = process.env.FRONTEND_URL?.replace(/\/+$/, "");

app.set("trust proxy", 1);

const productionOrigins = frontendUrl
  ? [
      frontendUrl,
      frontendUrl.includes("://www.")
        ? frontendUrl.replace("://www.", "://")
        : frontendUrl.replace("://", "://www."),
    ]
  : [];

const devOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? productionOrigins.length > 0
          ? productionOrigins
          : true
        : [...productionOrigins, ...devOrigins],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));

app.use("/api/auth", authRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/students", studentsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/transport", transportRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/users", usersRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/fee-templates", feeTemplatesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/academic-years", academicYearsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "خطأ داخلي في الخادم" });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend server running at http://${HOST}:${PORT}`);
});

export default app;
