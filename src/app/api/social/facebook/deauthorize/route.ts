import { handleFacebookRemoval } from "@/lib/social/facebook-deletion";
export async function POST(request: Request) { return handleFacebookRemoval(request, false); }
