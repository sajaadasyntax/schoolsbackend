import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const isBranchScoped = role !== "SUPER_ADMIN" && !!branchId;

    const [
      totalStudents,
      totalEmployees,
      totalBranches,
      payments,
      expenses,
      salaries,
      installments,
      branches,
    ] = await Promise.all([
      prisma.student.count({ where: isBranchScoped ? { branchId: branchId!, status: "ACTIVE" } : { status: "ACTIVE" } }),
      prisma.employee.count({ where: isBranchScoped ? { branchId: branchId!, status: "ACTIVE" } : { status: "ACTIVE" } }),
      prisma.branch.count({ where: isBranchScoped ? { id: branchId! } : undefined }),
      prisma.payment.findMany({ where: isBranchScoped ? { student: { branchId: branchId! } } : undefined, select: { amount: true } }),
      prisma.expense.findMany({ where: isBranchScoped ? { branchId: branchId! } : undefined, select: { amount: true } }),
      prisma.salaryPayment.findMany({
        where: isBranchScoped ? { employee: { branchId: branchId! } } : undefined,
        select: { amount: true },
      }),
      prisma.installment.findMany({
        where: isBranchScoped
          ? { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, student: { branchId: branchId! } }
          : { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
        select: { amount: true, paidAmount: true },
      }),
      prisma.branch.findMany({
        where: isBranchScoped ? { id: branchId! } : undefined,
        include: {
          _count: { select: { students: true, employees: true } },
        },
      }),
    ]);

    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalSalaries = salaries.reduce((s, sal) => s + Number(sal.amount), 0);
    const totalCosts = totalExpenses + totalSalaries;
    const netProfit = totalRevenue - totalCosts;
    const outstanding = installments.reduce(
      (s, i) => s + (Number(i.amount) - Number(i.paidAmount)),
      0
    );

    const branchesWithFinance = await Promise.all(
      branches.map(async (b) => {
        const [pays, exps, sals] = await Promise.all([
          prisma.payment.aggregate({ _sum: { amount: true }, where: { student: { branchId: b.id } } }),
          prisma.expense.aggregate({ _sum: { amount: true }, where: { branchId: b.id } }),
          prisma.salaryPayment.aggregate({ _sum: { amount: true }, where: { employee: { branchId: b.id } } }),
        ]);
        return {
          id: b.id,
          name: b.name,
          type: b.type,
          studentsCount: b._count.students,
          employeesCount: b._count.employees,
          revenue: Number(pays._sum.amount || 0),
          expenses: Number(exps._sum.amount || 0) + Number(sals._sum.amount || 0),
        };
      })
    );

    res.json({
      totalStudents,
      totalEmployees,
      totalBranches,
      totalRevenue,
      totalExpenses: totalCosts,
      netProfit,
      outstanding,
      branches: branchesWithFinance,
    });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/reports", async (req: Request, res: Response) => {
  try {
    const { role, branchId } = req.user!;
    const { branchId: queryBranch, startDate, endDate } = req.query;

    const targetBranch = role !== "SUPER_ADMIN" ? branchId : queryBranch as string || undefined;

    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const paymentWhere: Record<string, unknown> = {};
    const expenseWhere: Record<string, unknown> = {};
    const salaryWhere: Record<string, unknown> = {};

    if (targetBranch) {
      paymentWhere.student = { branchId: targetBranch };
      expenseWhere.branchId = targetBranch;
      salaryWhere.employee = { branchId: targetBranch };
    }
    if (Object.keys(dateFilter).length) {
      paymentWhere.paymentDate = dateFilter;
      expenseWhere.date = dateFilter;
      salaryWhere.paidDate = dateFilter;
    }

    const [payments, expenses, salaries, students, fees] = await Promise.all([
      prisma.payment.findMany({
        where: paymentWhere,
        include: { student: { select: { fullName: true, branch: true } }, receipt: true },
        orderBy: { paymentDate: "desc" },
      }),
      prisma.expense.findMany({ where: expenseWhere, include: { branch: true }, orderBy: { date: "desc" } }),
      prisma.salaryPayment.findMany({
        where: salaryWhere,
        include: { employee: { include: { branch: true } } },
        orderBy: { paidDate: "desc" },
      }),
      prisma.student.count({ where: targetBranch ? { branchId: targetBranch, status: "ACTIVE" } : { status: "ACTIVE" } }),
      prisma.fee.findMany({
        where: targetBranch ? { student: { branchId: targetBranch } } : {},
        select: { amount: true },
      }),
    ]);

    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalSalaries = salaries.reduce((s, sal) => s + Number(sal.amount), 0);
    const totalFees = fees.reduce((s, f) => s + Number(f.amount), 0);

    res.json({
      payments,
      expenses,
      salaries,
      summary: {
        totalRevenue,
        totalExpenses,
        totalSalaries,
        totalCosts: totalExpenses + totalSalaries,
        netProfit: totalRevenue - (totalExpenses + totalSalaries),
        totalFees,
        outstanding: totalFees - totalRevenue,
        totalStudents: students,
      },
    });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
