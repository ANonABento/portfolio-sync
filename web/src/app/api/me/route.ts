import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "octokit";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("gh_token")?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.users.getAuthenticated();
    return NextResponse.json({
      authenticated: true,
      user: { login: data.login, name: data.name, avatar: data.avatar_url },
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
