import type { Metadata } from "next";
import { BillForm } from "@/components/BillForm";
import { PageHead } from "@/components/ui";
export const metadata: Metadata = { title: "New sales bill" };
export default function Page() {
  return (<><PageHead title="New sales bill" sub="Rates and GST fill in from the last bill for that item. You can change them." /><BillForm type="sale" /></>);
}
