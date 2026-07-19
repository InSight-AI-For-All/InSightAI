"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "@/app/admin/admin.module.css";

const palette = { teal: "#11b8b5", blue: "#5c8df6", coral: "#f07c72", amber: "#f3c969" };

export function AdminTrendChart({ data, dataKey, color = "teal", valueFormat = "number" }: { data: Array<Record<string, string | number>>; dataKey: string; color?: keyof typeof palette; valueFormat?: "number" | "usd" | "money" }) {
  const formatValue = (value: number) => valueFormat === "usd" ? `$${value.toFixed(3)}` : valueFormat === "money" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100) : value.toLocaleString();
  return <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={palette[color]} stopOpacity={0.35} /><stop offset="95%" stopColor={palette[color]} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="date" tick={{ fill: "#8fa5b5", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(value) => String(value).slice(5)} /><YAxis tick={{ fill: "#8fa5b5", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: "#07162f", border: "1px solid rgba(255,255,255,.14)", borderRadius: 6 }} labelStyle={{ color: "#f8fbff" }} formatter={(value) => formatValue(Number(value))} /><Area type="monotone" dataKey={dataKey} stroke={palette[color]} strokeWidth={2} fill={`url(#fill-${dataKey})`} /></AreaChart></ResponsiveContainer></div>;
}