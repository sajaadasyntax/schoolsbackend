import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
