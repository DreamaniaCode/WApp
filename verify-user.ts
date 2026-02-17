
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = 'admin@example.com'
  const password = 'password123'

  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user) {
      console.log("User not found in DB");
      return;
  }

  console.log("User found:", user);

  if (user.password) {
      const isValid = await bcrypt.compare(password, user.password);
      console.log("Password valid:", isValid);
  } else {
      console.log("User has no password set");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
