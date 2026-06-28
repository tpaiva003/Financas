import { redirect } from "next/navigation";

export default function Home() {
  // A app real vive em /dashboard; o middleware trata da sessão.
  redirect("/dashboard");
}
