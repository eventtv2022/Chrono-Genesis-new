import { icons, type LucideIcon } from "lucide-react";
import React from "react";

type WebIconProps = {
  name: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
};

const aliases: Record<string, string> = {
  "alert-circle": "CircleAlert",
  "alert-triangle": "TriangleAlert",
  "bar-chart-2": "ChartNoAxesColumn",
  "cash-clock": "Clock3",
  "check-circle": "CircleCheck",
  "edit-2": "Pencil",
  grid: "LayoutGrid",
  home: "House",
  "log-in": "LogIn",
  "log-out": "LogOut",
  "more-horizontal": "Ellipsis",
  "play-circle": "CirclePlay",
  "plus-circle": "CirclePlus",
  "rotate-ccw": "RotateCcw",
  "trash-2": "Trash2",
  "trending-up": "TrendingUp",
  "user-check": "UserCheck",
  "user-plus": "UserPlus",
  "user-x": "UserX",
  "volume-2": "Volume2",
  "watch-variant": "Watch",
  "x-circle": "CircleX",
};

function toLucideName(name: string) {
  return aliases[name]
    ?? name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function WebIcon({ name, size = 24, color = "currentColor", style, ...props }: WebIconProps) {
  const Icon = (icons[toLucideName(name) as keyof typeof icons] as LucideIcon | undefined)
    ?? icons.CircleQuestionMark;
  return <Icon size={size} color={color} style={style} {...props} />;
}

export const Feather = WebIcon;
export const MaterialCommunityIcons = WebIcon;
