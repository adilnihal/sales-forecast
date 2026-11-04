import type { Metadata } from "next";
import { BillList } from "@/components/BillList";
export const metadata: Metadata = { title: "Sales bills" };
export default function Page() { return <BillList type="sale" />; }
