
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function GET() {
    console.log("API /api/users GET requested");
    try {
        const session = await getServerSession(authOptions);
        console.log("API /api/users session:", session ? "Authenticated" : "Unauthenticated");

        if (!session) {
            console.log("API /api/users: Unauthorized");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, createdAt: true }
        });
        console.log("API /api/users returned count:", users.length);

        return NextResponse.json(users);
    } catch (error: any) {
        console.error("API /api/users error:", error);
        return NextResponse.json({ error: "Internal Server Error: " + error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name
            }
        });
        return NextResponse.json({ id: user.id, email: user.email, name: user.name });
    } catch (error) {
        return NextResponse.json({ error: "User already exists or failed to create" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    if (id === (session.user as any).id) {
         return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    await prisma.user.delete({
        where: { id }
    });

    return NextResponse.json({ success: true });
}
