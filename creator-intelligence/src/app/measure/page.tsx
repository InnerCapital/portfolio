import { redirect } from "next/navigation";

// The feed moved to the home page. Keep this path working for old links.
export default function MeasurePage() {
  redirect("/");
}
