import { Prisma, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function isMissingTableError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021";
}

async function main() {
  const email = "admin@school.com";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists (${email}), skipping.`);
    return;
  }

  const hashedPassword = await bcrypt.hash("admin123", 12);

  const admin = await prisma.user.create({
    data: {
      name: "المدير العام",
      email,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
    },
  });

  console.log(`Admin user created: ${admin.email}`);
  console.log("Email   : admin@school.com");
  console.log("Password: admin123");
  console.log("Change this password after first login!");
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
