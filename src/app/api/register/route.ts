import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, password, name } = body;

        if (!email || !password) {
            return new NextResponse("Missing missing fields", { status: 400 });
        }

        const exists = await prisma.user.findUnique({
            where: {
                email
            }
        });

        if (exists) {
            throw new Error("Email already exists");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                name,
                password: hashedPassword
            }
        });

        return NextResponse.json(user);
    } catch (error: any) {
        console.log("REGISTER_ERROR", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
