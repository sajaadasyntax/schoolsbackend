import { PrismaClient, Role, BranchType, Gender, StudentStatus, FeeType, PaymentMethod, EmployeeStatus, InventoryCategoryType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Create branches
  const branch1 = await prisma.branch.create({
    data: {
      name: "مدرسة النور الابتدائية",
      type: BranchType.SCHOOL,
      address: "شارع الملك فيصل، الرياض",
      phone: "0112345678",
    },
  });

  const branch2 = await prisma.branch.create({
    data: {
      name: "روضة الأمل",
      type: BranchType.KINDERGARTEN,
      address: "حي الملز، الرياض",
      phone: "0119876543",
    },
  });

  console.log("✅ Branches created");

  // Create Super Admin
  const hashedPassword = await bcrypt.hash("admin123", 12);
  const superAdmin = await prisma.user.create({
    data: {
      name: "المدير العام",
      email: "admin@school.com",
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
    },
  });

  // Create Branch Admin for branch1
  const branchAdmin1 = await prisma.user.create({
    data: {
      name: "أحمد محمد",
      email: "branch1@school.com",
      password: await bcrypt.hash("branch123", 12),
      role: Role.BRANCH_ADMIN,
      branchId: branch1.id,
    },
  });

  // Create Accountant
  await prisma.user.create({
    data: {
      name: "فاطمة علي",
      email: "accountant@school.com",
      password: await bcrypt.hash("acc123", 12),
      role: Role.ACCOUNTANT,
      branchId: branch1.id,
    },
  });

  // Create Inventory Manager
  await prisma.user.create({
    data: {
      name: "محمد خالد",
      email: "inventory@school.com",
      password: await bcrypt.hash("inv123", 12),
      role: Role.INVENTORY_MANAGER,
      branchId: branch1.id,
    },
  });

  // Create Teacher
  const teacher1 = await prisma.user.create({
    data: {
      name: "سارة عبدالله",
      email: "teacher@school.com",
      password: await bcrypt.hash("teacher123", 12),
      role: Role.TEACHER,
      branchId: branch1.id,
    },
  });

  console.log("✅ Users created");

  // Create Classes
  const class1 = await prisma.class.create({
    data: {
      name: "الصف الأول أ",
      grade: "الأول",
      branchId: branch1.id,
      teacherId: teacher1.id,
      academicYear: "2024-2025",
    },
  });

  const class2 = await prisma.class.create({
    data: {
      name: "الصف الثاني ب",
      grade: "الثاني",
      branchId: branch1.id,
      academicYear: "2024-2025",
    },
  });

  const class3 = await prisma.class.create({
    data: {
      name: "مجموعة الأزهار",
      grade: "تمهيدي",
      branchId: branch2.id,
      academicYear: "2024-2025",
    },
  });

  console.log("✅ Classes created");

  // Create Students
  const student1 = await prisma.student.create({
    data: {
      fullName: "عمر محمد الأحمد",
      parentName: "محمد الأحمد",
      parentPhone: "0501234567",
      gender: Gender.MALE,
      classId: class1.id,
      branchId: branch1.id,
      status: StudentStatus.ACTIVE,
    },
  });

  const student2 = await prisma.student.create({
    data: {
      fullName: "نورة خالد السالم",
      parentName: "خالد السالم",
      parentPhone: "0507654321",
      gender: Gender.FEMALE,
      classId: class1.id,
      branchId: branch1.id,
      status: StudentStatus.ACTIVE,
    },
  });

  const student3 = await prisma.student.create({
    data: {
      fullName: "يوسف عبدالرحمن",
      parentName: "عبدالرحمن يوسف",
      parentPhone: "0509876543",
      gender: Gender.MALE,
      classId: class2.id,
      branchId: branch1.id,
      status: StudentStatus.ACTIVE,
    },
  });

  const student4 = await prisma.student.create({
    data: {
      fullName: "ريم سعد المطيري",
      parentName: "سعد المطيري",
      parentPhone: "0551234567",
      gender: Gender.FEMALE,
      classId: class3.id,
      branchId: branch2.id,
      status: StudentStatus.ACTIVE,
    },
  });

  console.log("✅ Students created");

  // Create Fees
  await prisma.fee.createMany({
    data: [
      { studentId: student1.id, type: FeeType.TUITION, amount: 10000, description: "رسوم دراسية سنوية", academicYear: "2024-2025" },
      { studentId: student1.id, type: FeeType.TRANSPORT, amount: 3000, description: "رسوم مواصلات سنوية", academicYear: "2024-2025" },
      { studentId: student2.id, type: FeeType.TUITION, amount: 10000, description: "رسوم دراسية سنوية", academicYear: "2024-2025" },
      { studentId: student3.id, type: FeeType.TUITION, amount: 9000, description: "رسوم دراسية سنوية", academicYear: "2024-2025" },
      { studentId: student4.id, type: FeeType.TUITION, amount: 7000, description: "رسوم روضة سنوية", academicYear: "2024-2025" },
    ],
  });

  // Create Payments
  const payment1 = await prisma.payment.create({
    data: {
      studentId: student1.id,
      amount: 5000,
      method: PaymentMethod.BANK_TRANSFER,
      receiptNumber: "RCP-2024-001",
      notes: "دفعة أولى",
    },
  });

  const payment2 = await prisma.payment.create({
    data: {
      studentId: student2.id,
      amount: 10000,
      method: PaymentMethod.CASH,
      receiptNumber: "RCP-2024-002",
      notes: "دفعة كاملة",
    },
  });

  await prisma.payment.create({
    data: {
      studentId: student4.id,
      amount: 3500,
      method: PaymentMethod.CHECK,
      receiptNumber: "RCP-2024-003",
    },
  });

  console.log("✅ Payments created");

  // Create Installments for student1
  await prisma.installment.createMany({
    data: [
      {
        studentId: student1.id,
        amount: 5000,
        dueDate: new Date("2024-09-01"),
        paidAmount: 5000,
        status: "PAID",
      },
      {
        studentId: student1.id,
        amount: 5000,
        dueDate: new Date("2025-01-01"),
        paidAmount: 0,
        status: "OVERDUE",
      },
      {
        studentId: student3.id,
        amount: 3000,
        dueDate: new Date("2024-09-01"),
        paidAmount: 1500,
        status: "PARTIAL",
      },
      {
        studentId: student3.id,
        amount: 3000,
        dueDate: new Date("2025-02-01"),
        paidAmount: 0,
        status: "PENDING",
      },
    ],
  });

  // Create Transport Subscriptions
  await prisma.transportSubscription.create({
    data: {
      studentId: student1.id,
      route: "خط الملز - المدرسة",
      monthlyFee: 250,
      status: "ACTIVE",
    },
  });

  console.log("✅ Installments & transport created");

  // Create Employees
  const emp1 = await prisma.employee.create({
    data: {
      fullName: "سارة عبدالله",
      jobTitle: "معلمة",
      phone: "0501112222",
      branchId: branch1.id,
      baseSalary: 5000,
      status: EmployeeStatus.ACTIVE,
    },
  });

  const emp2 = await prisma.employee.create({
    data: {
      fullName: "علي حسن",
      jobTitle: "إداري",
      phone: "0502223333",
      branchId: branch1.id,
      baseSalary: 4000,
      status: EmployeeStatus.ACTIVE,
    },
  });

  const emp3 = await prisma.employee.create({
    data: {
      fullName: "هند محمد",
      jobTitle: "معلمة روضة",
      phone: "0503334444",
      branchId: branch2.id,
      baseSalary: 4500,
      status: EmployeeStatus.ACTIVE,
    },
  });

  // Create Salary Payments
  await prisma.salaryPayment.createMany({
    data: [
      { employeeId: emp1.id, amount: 5000, month: 9, year: 2024, notes: "راتب سبتمبر" },
      { employeeId: emp1.id, amount: 5000, month: 10, year: 2024 },
      { employeeId: emp2.id, amount: 4000, month: 9, year: 2024 },
      { employeeId: emp3.id, amount: 4500, month: 9, year: 2024 },
    ],
  });

  // Create Expenses
  await prisma.expense.createMany({
    data: [
      { branchId: branch1.id, category: "صيانة", description: "صيانة التكييف", amount: 800, date: new Date("2024-10-15") },
      { branchId: branch1.id, category: "مستلزمات", description: "أدوات تنظيف", amount: 350, date: new Date("2024-10-20") },
      { branchId: branch2.id, category: "مستلزمات", description: "مستلزمات مكتبية", amount: 200, date: new Date("2024-10-18") },
      { branchId: branch1.id, category: "فواتير", description: "فاتورة كهرباء", amount: 1200, date: new Date("2024-10-01") },
    ],
  });

  console.log("✅ Employees, salaries, expenses created");

  // Create Inventory Categories
  const cat1 = await prisma.inventoryCategory.create({
    data: {
      name: "الكتب المدرسية",
      type: InventoryCategoryType.TEXTBOOK,
      branchId: branch1.id,
    },
  });

  const cat2 = await prisma.inventoryCategory.create({
    data: {
      name: "الزي المدرسي",
      type: InventoryCategoryType.UNIFORM,
      branchId: branch1.id,
    },
  });

  const cat3 = await prisma.inventoryCategory.create({
    data: {
      name: "اللوازم المدرسية",
      type: InventoryCategoryType.CUSTOM,
      description: "أدوات وقرطاسية",
      branchId: branch1.id,
    },
  });

  // Create Inventory Items
  const item1 = await prisma.inventoryItem.create({
    data: {
      name: "كتاب الرياضيات - الصف الأول",
      categoryId: cat1.id,
      branchId: branch1.id,
      quantity: 50,
      minQuantity: 10,
      unitPrice: 35,
    },
  });

  const item2 = await prisma.inventoryItem.create({
    data: {
      name: "كتاب اللغة العربية - الصف الأول",
      categoryId: cat1.id,
      branchId: branch1.id,
      quantity: 45,
      minQuantity: 10,
      unitPrice: 30,
    },
  });

  const item3 = await prisma.inventoryItem.create({
    data: {
      name: "قميص الزي الرسمي",
      categoryId: cat2.id,
      branchId: branch1.id,
      quantity: 8,
      minQuantity: 15,
      unitPrice: 80,
    },
  });

  const item4 = await prisma.inventoryItem.create({
    data: {
      name: "طقم أقلام",
      categoryId: cat3.id,
      branchId: branch1.id,
      quantity: 100,
      minQuantity: 20,
      unitPrice: 15,
    },
  });

  // Create Inventory Distributions
  await prisma.inventoryDistribution.createMany({
    data: [
      {
        itemId: item1.id,
        studentId: student1.id,
        quantity: 1,
        distributionDate: new Date("2024-09-05"),
        distributedById: superAdmin.id,
        notes: "بداية العام الدراسي",
      },
      {
        itemId: item2.id,
        studentId: student1.id,
        quantity: 1,
        distributionDate: new Date("2024-09-05"),
        distributedById: superAdmin.id,
      },
      {
        itemId: item1.id,
        studentId: student2.id,
        quantity: 1,
        distributionDate: new Date("2024-09-05"),
        distributedById: superAdmin.id,
      },
      {
        itemId: item3.id,
        studentId: student2.id,
        quantity: 1,
        distributionDate: new Date("2024-09-05"),
        distributedById: superAdmin.id,
      },
      {
        itemId: item4.id,
        studentId: student3.id,
        quantity: 2,
        distributionDate: new Date("2024-09-10"),
        distributedById: branchAdmin1.id,
      },
    ],
  });

  console.log("✅ Inventory created and distributed");
  console.log("\n🎉 Seed completed successfully!");
  console.log("\n📋 Login credentials:");
  console.log("   Super Admin: admin@school.com / admin123");
  console.log("   Branch Admin: branch1@school.com / branch123");
  console.log("   Accountant: accountant@school.com / acc123");
  console.log("   Inventory Manager: inventory@school.com / inv123");
  console.log("   Teacher: teacher@school.com / teacher123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
