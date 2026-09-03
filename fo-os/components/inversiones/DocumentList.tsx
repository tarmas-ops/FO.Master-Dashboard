import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/skeleton";
import { formatDate, formatNumber } from "@/lib/formatters";
import type { DocumentRecord, DocumentType } from "@/types";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  LEGAL: "Legal",
  FINANCIERO: "Financiero",
  TRIBUTARIO: "Tributario",
  TASACION: "Tasación",
  BANCO: "Banco",
  CONTRATO_ARRIENDO: "Contrato de Arriendo",
  INVESTMENT_MEMO: "Investment Memo",
  DUE_DILIGENCE: "Due Diligence",
  MODELO_FINANCIERO: "Modelo Financiero",
  ESCRITURA: "Escritura",
  OTROS: "Otros",
};

export function DocumentList({ documents, title = "Documentos" }: { documents: DocumentRecord[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="text-[12px] text-muted">{documents.length}</span>
      </CardHeader>
      <CardContent className="pt-0">
        {documents.length === 0 ? (
          <EmptyState title="Sin documentos" description="Aún no se han adjuntado documentos a este registro." />
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <FileText className="size-4 shrink-0 text-muted-2" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-foreground">{d.name}</p>
                  <p className="text-[12px] text-muted">
                    {formatDate(d.uploadedAt)} · {formatNumber(d.sizeKb / 1024, 1)} MB
                  </p>
                </div>
                <Badge variant="outline">{DOCUMENT_TYPE_LABELS[d.type]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
