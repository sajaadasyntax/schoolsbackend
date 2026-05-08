/**
 * One-off backfill: for salary_payment rows that were created before the
 * breakdown columns were added (baseSalary=0, all allowances/deductions=0,
 * but amount>0), set baseSalary = amount so the UI can display meaningful data.
 *
 * Run once: npm run db:backfill-salaries
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Note: column names are camelCase in this DB (no @map on individual fields).
  const result = await prisma.$executeRaw`
    UPDATE salary_payments
    SET "baseSalary" = amount
    WHERE "baseSalary" = 0
      AND "allowance1" = 0
      AND "allowance2" = 0
      AND "transportAllowance" = 0
      AND bonus = 0
      AND loan = 0
      AND "leaveDeduction" = 0
      AND penalty = 0
      AND subscription = 0
      AND "otherDeduction" = 0
      AND amount > 0
  `;
  console.log(`Backfilled ${result} salary payment row(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
