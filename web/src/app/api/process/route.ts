import { NextRequest, NextResponse } from "next/server";
import { processRepo, type RepoInfo } from "@/lib/portfolio";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("gh_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { repo } = (await request.json()) as { repo: RepoInfo };
    const entry = await processRepo(token, repo);
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process repo" },
      { status: 500 }
    );
  }
}
