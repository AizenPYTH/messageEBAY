import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/conversations/:path*",
    "/replies/:path*",
    "/seller-profile/:path*",
    "/history/:path*",
    "/stats/:path*",
    "/settings/:path*",
    "/debug/:path*",
    "/login",
  ],
};
