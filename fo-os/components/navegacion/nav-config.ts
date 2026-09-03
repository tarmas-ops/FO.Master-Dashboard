import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  Briefcase,
  Building2,
  FileText,
  Gauge,
  GitBranch,
  Landmark,
  LayoutDashboard,
  LineChart,
  PieChart,
  Settings,
  ShieldAlert,
  TrendingUp,
  Wallet,
  Workflow,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Pregunta que responde la página. */
  question: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Resumen",
    items: [{ label: "Resumen General", href: "/resumen", icon: LayoutDashboard, question: "¿Cómo está nuestro patrimonio?" }],
  },
  {
    label: "Portafolio",
    items: [
      { label: "Inversiones", href: "/inversiones", icon: Briefcase, question: "¿Qué tenemos y cuánto vale?" },
      { label: "Inmobiliario", href: "/inmobiliario", icon: Building2, question: "¿Cómo están funcionando nuestros activos?" },
      { label: "Mercados Privados", href: "/mercados-privados", icon: Landmark, question: "¿Cómo están rindiendo nuestras inversiones ilíquidas?" },
      { label: "Mercados Públicos", href: "/mercados-publicos", icon: LineChart, question: "¿Cómo está la cartera líquida?" },
      { label: "Empresas", href: "/empresas", icon: Workflow, question: "¿Cómo están evolucionando nuestras participaciones privadas?" },
    ],
  },
  {
    label: "Análisis",
    items: [
      { label: "Rendimiento", href: "/rendimiento", icon: TrendingUp, question: "¿Estamos creando valor?" },
      { label: "Flujo de Caja", href: "/flujo-de-caja", icon: Wallet, question: "¿Cuánto dinero estamos generando y utilizando?" },
      { label: "Asignación", href: "/asignacion", icon: PieChart, question: "¿Dónde estamos expuestos?" },
      { label: "Riesgo", href: "/riesgo", icon: ShieldAlert, question: "¿Qué puede salir mal?" },
    ],
  },
  {
    label: "Family Office",
    items: [
      { label: "Estructura Patrimonial", href: "/estructura-patrimonial", icon: GitBranch, question: "¿Qué posee realmente la familia?" },
      { label: "Deuda", href: "/deuda", icon: Gauge, question: "¿Dónde está nuestro riesgo financiero?" },
      { label: "Documentos", href: "/documentos", icon: FileText, question: "¿Dónde está la documentación de cada activo?" },
      { label: "Movimientos", href: "/movimientos", icon: ArrowLeftRight, question: "¿Qué entró y qué salió?" },
    ],
  },
  {
    label: "Oportunidades",
    items: [{ label: "Pipeline de Inversiones", href: "/pipeline", icon: BarChart3, question: "¿Dónde invertiremos próximamente?" }],
  },
  {
    label: "Configuración",
    items: [{ label: "Configuración", href: "/configuracion", icon: Settings, question: "Parámetros, monedas y políticas." }],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function navItemForPath(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];
}
