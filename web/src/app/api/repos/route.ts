import { NextRequest, NextResponse } from "next/server";
import { fetchRepos } from "@/lib/portfolio";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("gh_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const repos = await fetchRepos(token);
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch repos" },
      { status: 500 }
    );
  }
}
