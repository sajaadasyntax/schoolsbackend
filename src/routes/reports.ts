import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/reports/installments-monthly?year=&branchId=
router.get("/installments-monthly", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const year = Number(req.query.year) || new Date().getFullYear();
    const targetBranch = role === "SUPER_ADMIN" ? (req.query.branchId as string | undefined) : userBranch;
    const where: Record<string, unknown> = {
      dueDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
    };
    if (targetBranch) where.student = { branchId: targetBranch };

    const installments = await prisma.installment.findMany({
      where,
      select: { amount: true, paidAmount: true, dueDate: true },
    });
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      due: 0,
      paid: 0,
      remaining: 0,
      count: 0,
    }));
    for (const installment of installments) {
      const row = months[new Date(installment.dueDate).getMonth()];
      row.due += Number(installment.amount);
      row.paid += Number(installment.paidAmount);
      row.remaining += Number(installment.amount) - Number(installment.paidAmount);
      row.count += 1;
    }
    const totals = months.reduce(
      (acc, row) => ({
        due: acc.due + row.due,
        paid: acc.paid + row.paid,
        remaining: acc.remaining + row.remaining,
        count: acc.count + row.count,
      }),
      { due: 0, paid: 0, remaining: 0, count: 0 }
    );
    res.json({ year, months, totals });
  } catch (err) {
    console.error("monthly installments report:", err);
    res.status(500).json({ error: "تعذر تحميل تقرير الأقساط الشهري" });
  }
});

// GET /api/reports/profit-loss?startDate=&endDate=&branchId=
// Cash-basis profit and loss report for the requested period.
router.get("/profit-loss", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), 0, 1);
    const startDate = typeof req.query.startDate === "string" && req.query.startDate
      ? new Date(`${req.query.startDate}T00:00:00`)
      : defaultStart;
    const endDate = typeof req.query.endDate === "string" && req.query.endDate
      ? new Date(`${req.query.endDate}T23:59:59.999`)
      : today;
    const targetBranch = role === "SUPER_ADMIN" ? (req.query.branchId as string | undefined) : userBranch;

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      res.status(400).json({ error: "نطاق التاريخ غير صالح" });
      return;
    }

    const dateFilter = { gte: startDate, lte: endDate };
    const paymentWhere: Record<string, unknown> = { paymentDate: dateFilter };
    const expenseWhere: Record<string, unknown> = { date: dateFilter };
    const salaryWhere: Record<string, unknown> = { paidDate: dateFilter };
    if (targetBranch) {
      paymentWhere.student = { branchId: targetBranch };
      expenseWhere.branchId = targetBranch;
      salaryWhere.employee = { branchId: targetBranch };
    }

    const [payments, expenses, salaries] = await Promise.all([
      prisma.payment.findMany({ where: paymentWhere, select: { amount: true } }),
      prisma.expense.findMany({ where: expenseWhere, select: { category: true, amount: true } }),
      prisma.salaryPayment.findMany({ where: salaryWhere, select: { amount: true, loan: true } }),
    ]);

    const collected = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const directExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const salariesPaid = salaries.reduce((sum, salary) => sum + Number(salary.amount), 0);
    const totalExpenses = directExpenses + salariesPaid;
    const categories: Record<string, number> = {};
    for (const expense of expenses) {
      categories[expense.category] = (categories[expense.category] || 0) + Number(expense.amount);
    }
    if (salariesPaid) categories["رواتب"] = (categories["رواتب"] || 0) + salariesPaid;

    res.json({
      startDate,
      endDate,
      collected,
      directExpenses,
      salariesPaid,
      totalExpenses,
      profit: collected - totalExpenses,
      categories,
      records: {
        payments: payments.length,
        expenses: expenses.length,
        salaries: salaries.length,
      },
    });
  } catch (err) {
    console.error("profit-loss report:", err);
    res.status(500).json({ error: "تعذر تحميل تقرير الأرباح والخسائر" });
  }
});

// GET /api/reports/class-fees?branchId=&academicYear=
// Returns per-class totals for each fee bucket — mirrors تقرير.xlsx layout
router.get("/class-fees", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { branchId: queryBranch, academicYear } = req.query;

    const targetBranch = role === "SUPER_ADMIN" ? (queryBranch as string | undefined) : userBranch;
    const year = (academicYear as string) || undefined;

    const feeWhere: Record<string, unknown> = {};
    if (year) feeWhere.academicYear = year;

    const classes = await prisma.class.findMany({
      where: targetBranch ? { branchId: targetBranch } : undefined,
      include: {
        branch: true,
        students: {
          where: { status: { in: ["ACTIVE", "ARCHIVED"] } },
          include: {
            fees: { where: feeWhere },
            transportSubscription: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const rows = classes.map((cls) => {
      const buckets = {
        registration: { due: 0, paid: 0 },
        installment1: { due: 0, paid: 0 },
        installment2: { due: 0, paid: 0 },
        installment3: { due: 0, paid: 0 },
        installment4: { due: 0, paid: 0 },
        books: { due: 0, paid: 0 },
        uniform: { due: 0, paid: 0 },
        other: { due: 0, paid: 0 },
      };

      const bucketKey: Record<string, keyof typeof buckets> = {
        REGISTRATION: "registration",
        INSTALLMENT_1: "installment1",
        INSTALLMENT_2: "installment2",
        INSTALLMENT_3: "installment3",
        INSTALLMENT_4: "installment4",
        BOOKS: "books",
        UNIFORM: "uniform",
      };

      let totalDue = 0;
      let totalPaid = 0;
      let transportRevenue = 0;
      let transportSubscribers = 0;

      for (const student of cls.students) {
        for (const fee of student.fees) {
          const key = bucketKey[fee.bucket] || "other";
          const due = Number(fee.amount);
          const paid = Number(fee.paidAmount);
          buckets[key].due += due;
          buckets[key].paid += paid;
          totalDue += due;
          totalPaid += paid;
        }
        if (student.transportSubscription?.status === "ACTIVE") {
          transportRevenue += Number(student.transportSubscription.monthlyFee);
          transportSubscribers += 1;
        }
      }

      return {
        classId: cls.id,
        className: cls.name,
        branchName: cls.branch.name,
        studentCount: cls.students.length,
        totalDue,
        totalPaid,
        remaining: totalDue - totalPaid,
        buckets,
        transportRevenue,
        transportSubscribers,
      };
    });

    // Grand total row
    const totals = rows.reduce(
      (acc, row) => {
        acc.totalDue += row.totalDue;
        acc.totalPaid += row.totalPaid;
        acc.remaining += row.remaining;
        acc.transportRevenue += row.transportRevenue;
        acc.transportSubscribers += row.transportSubscribers;
        for (const key of Object.keys(row.buckets) as (keyof typeof row.buckets)[]) {
          acc.buckets[key].due += row.buckets[key].due;
          acc.buckets[key].paid += row.buckets[key].paid;
        }
        return acc;
      },
      {
        totalDue: 0,
        totalPaid: 0,
        remaining: 0,
        transportRevenue: 0,
        transportSubscribers: 0,
        buckets: {
          registration: { due: 0, paid: 0 },
          installment1: { due: 0, paid: 0 },
          installment2: { due: 0, paid: 0 },
          installment3: { due: 0, paid: 0 },
          installment4: { due: 0, paid: 0 },
          books: { due: 0, paid: 0 },
          uniform: { due: 0, paid: 0 },
          other: { due: 0, paid: 0 },
        },
      }
    );

    res.json({ rows, totals });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/reports/student-fees?classId=&branchId=&academicYear=
// Per-student bucket breakdown — mirrors كل الطلاب-1.xlsx
router.get("/student-fees", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { classId, branchId: queryBranch, academicYear } = req.query;

    const targetBranch = role === "SUPER_ADMIN" ? (queryBranch as string | undefined) : userBranch;
    const year = (academicYear as string) || undefined;

    const where: Record<string, unknown> = { status: { in: ["ACTIVE", "ARCHIVED"] } };
    if (targetBranch) where.branchId = targetBranch;
    if (classId) where.classId = classId;

    const feeWhere: Record<string, unknown> = {};
    if (year) feeWhere.academicYear = year;

    const students = await prisma.student.findMany({
      where,
      include: {
        class: true,
        branch: true,
        fees: { where: feeWhere },
        transportSubscription: true,
      },
      orderBy: [{ class: { name: "asc" } }, { fullName: "asc" }],
    });

    const bucketKey: Record<string, string> = {
      REGISTRATION: "registration",
      INSTALLMENT_1: "installment1",
      INSTALLMENT_2: "installment2",
      INSTALLMENT_3: "installment3",
      INSTALLMENT_4: "installment4",
      BOOKS: "books",
      UNIFORM: "uniform",
    };

    const rows = students.map((student, idx) => {
      const buckets: Record<string, { due: number; paid: number }> = {
        registration: { due: 0, paid: 0 },
        installment1: { due: 0, paid: 0 },
        installment2: { due: 0, paid: 0 },
        installment3: { due: 0, paid: 0 },
        installment4: { due: 0, paid: 0 },
        books: { due: 0, paid: 0 },
        uniform: { due: 0, paid: 0 },
        other: { due: 0, paid: 0 },
      };

      let totalDue = 0;
      let totalPaid = 0;

      for (const fee of student.fees) {
        const key = bucketKey[fee.bucket] || "other";
        buckets[key].due += Number(fee.amount);
        buckets[key].paid += Number(fee.paidAmount);
        totalDue += Number(fee.amount);
        totalPaid += Number(fee.paidAmount);
      }

      return {
        index: idx + 1,
        studentId: student.id,
        fullName: student.fullName,
        className: student.class?.name || "",
        branchName: student.branch.name,
        isOrphan: student.isOrphan,
        notes: student.notes || (student.isOrphan ? "ايتام" : ""),
        totalDue,
        totalPaid,
        remaining: totalDue - totalPaid,
        buckets,
        transportMonthlyFee: student.transportSubscription ? Number(student.transportSubscription.monthlyFee) : null,
        transportStatus: student.transportSubscription?.status ?? null,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.totalDue += row.totalDue;
        acc.totalPaid += row.totalPaid;
        acc.remaining += row.remaining;
        for (const key of Object.keys(row.buckets)) {
          if (!acc.buckets[key]) acc.buckets[key] = { due: 0, paid: 0 };
          acc.buckets[key].due += row.buckets[key].due;
          acc.buckets[key].paid += row.buckets[key].paid;
        }
        return acc;
      },
      {
        totalDue: 0,
        totalPaid: 0,
        remaining: 0,
        buckets: {} as Record<string, { due: number; paid: number }>,
      }
    );

    res.json({ rows, totals });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/reports/salary-register?branchId=&month=&year=
// Salary register with two sections (teaching / non-teaching) — mirrors مرتبات مارس.xlsx
router.get("/salary-register", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { branchId: queryBranch, month, year } = req.query;

    const targetBranch = role === "SUPER_ADMIN" ? (queryBranch as string | undefined) : userBranch;

    const where: Record<string, unknown> = {};
    if (month) where.month = parseInt(month as string);
    if (year) where.year = parseInt(year as string);
    if (targetBranch) where.employee = { branchId: targetBranch };

    const salaryPayments = await prisma.salaryPayment.findMany({
      where,
      include: {
        employee: { include: { branch: true } },
      },
      orderBy: [{ employee: { category: "asc" } }, { employee: { fullName: "asc" } }],
    });

    const mapRow = (sp: typeof salaryPayments[number], idx: number) => ({
      index: idx + 1,
      id: sp.id,
      employeeId: sp.employeeId,
      fullName: sp.employee.fullName,
      jobTitle: sp.employee.jobTitle || "",
      category: sp.employee.category,
      branchName: sp.employee.branch.name,
      baseSalary: Number(sp.baseSalary),
      allowance1: Number(sp.allowance1),
      allowance2: Number(sp.allowance2),
      transportAllowance: Number(sp.transportAllowance),
      bonus: Number(sp.bonus),
      totalEarnings:
        Number(sp.baseSalary) +
        Number(sp.allowance1) +
        Number(sp.allowance2) +
        Number(sp.transportAllowance) +
        Number(sp.bonus),
      loan: Number(sp.loan),
      leaveDeduction: Number(sp.leaveDeduction),
      penalty: Number(sp.penalty),
      subscription: Number(sp.subscription),
      otherDeduction: Number(sp.otherDeduction),
      totalDeductions:
        Number(sp.loan) +
        Number(sp.leaveDeduction) +
        Number(sp.penalty) +
        Number(sp.subscription) +
        Number(sp.otherDeduction),
      netSalary: Number(sp.amount),
      month: sp.month,
      year: sp.year,
      paidDate: sp.paidDate,
      signedAt: sp.signedAt,
      notes: sp.notes,
    });

    const teaching = salaryPayments
      .filter((sp) => sp.employee.category === "TEACHING")
      .map((sp, i) => mapRow(sp, i));
    const staff = salaryPayments
      .filter((sp) => sp.employee.category !== "TEACHING")
      .map((sp, i) => mapRow(sp, i));

    const sumSection = (rows: ReturnType<typeof mapRow>[]) =>
      rows.reduce(
        (acc, row) => ({
          baseSalary: acc.baseSalary + row.baseSalary,
          allowance1: acc.allowance1 + row.allowance1,
          allowance2: acc.allowance2 + row.allowance2,
          transportAllowance: acc.transportAllowance + row.transportAllowance,
          bonus: acc.bonus + row.bonus,
          totalEarnings: acc.totalEarnings + row.totalEarnings,
          loan: acc.loan + row.loan,
          leaveDeduction: acc.leaveDeduction + row.leaveDeduction,
          penalty: acc.penalty + row.penalty,
          subscription: acc.subscription + row.subscription,
          otherDeduction: acc.otherDeduction + row.otherDeduction,
          totalDeductions: acc.totalDeductions + row.totalDeductions,
          netSalary: acc.netSalary + row.netSalary,
        }),
        {
          baseSalary: 0,
          allowance1: 0,
          allowance2: 0,
          transportAllowance: 0,
          bonus: 0,
          totalEarnings: 0,
          loan: 0,
          leaveDeduction: 0,
          penalty: 0,
          subscription: 0,
          otherDeduction: 0,
          totalDeductions: 0,
          netSalary: 0,
        }
      );

    res.json({
      teaching,
      staff,
      teachingTotals: sumSection(teaching),
      staffTotals: sumSection(staff),
      grandTotal: sumSection([...teaching, ...staff]),
    });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/reports/expenses-register?branchId=&year=&month=
// Expense ledger grouped by month — mirrors مصروفات.xlsx
router.get("/expenses-register", async (req: Request, res: Response) => {
  try {
    const { role, branchId: userBranch } = req.user!;
    const { branchId: queryBranch, year, month } = req.query;

    const targetBranch = role === "SUPER_ADMIN" ? (queryBranch as string | undefined) : userBranch;

    const where: Record<string, unknown> = {};
    if (targetBranch) where.branchId = targetBranch;

    const dateFilter: Record<string, unknown> = {};
    if (year) {
      const y = parseInt(year as string);
      if (month) {
        const m = parseInt(month as string);
        dateFilter.gte = new Date(y, m - 1, 1);
        dateFilter.lte = new Date(y, m, 0, 23, 59, 59);
      } else {
        dateFilter.gte = new Date(y, 0, 1);
        dateFilter.lte = new Date(y, 11, 31, 23, 59, 59);
      }
    }
    if (Object.keys(dateFilter).length) where.date = dateFilter;

    const expenses = await prisma.expense.findMany({
      where,
      include: { branch: true },
      orderBy: { date: "asc" },
    });

    // Group by month
    const grouped: Record<string, { month: number; year: number; total: number; items: typeof expenses }> = {};
    for (const expense of expenses) {
      const d = new Date(expense.date);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (!grouped[key]) {
        grouped[key] = { month: d.getMonth() + 1, year: d.getFullYear(), total: 0, items: [] };
      }
      grouped[key].total += Number(expense.amount);
      grouped[key].items.push(expense);
    }

    const months = Object.values(grouped).sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );

    const grandTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

    res.json({ months, grandTotal });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
