import { Prisma, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function isMissingTableError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021";
}

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@school.com";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const name = process.env.ADMIN_NAME || "المدير العام";

  if (password.length < 6) {
    throw new Error("ADMIN_PASSWORD must contain at least 6 characters");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      branchId: null,
    },
    create: {
      name,
      email,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
    },
  });

  console.log(`Admin credentials seeded: ${admin.email}`);
  console.log("Only the admin user was created or updated.");
}

main()
  .catch((e) => {
    if (isMissingTableError(e)) {
      console.error(
        "Database tables are missing. Apply the schema first, then run this seed again:\n" +
          "  npm run db:generate\n" +
          "  npm run db:push\n" +
          "  npm run db:seed-admin"
      );
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
