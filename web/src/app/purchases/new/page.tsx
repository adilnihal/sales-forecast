import type { Metadata } from "next";
import { BillForm } from "@/components/BillForm";
import { PageHead } from "@/components/ui";
export const metadata: Metadata = { title: "New purchase bill" };
export default function Page() {
  return (<><PageHead title="New purchase bill" sub="Buying adds to stock. Enter the supplier's invoice number to match it later." /><BillForm type="purchase" /></>);
}
