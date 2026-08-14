import { Badge, Card } from "@/components/ui/primitives";
import type { hypotheses } from "@/db/schema";
import type { ConfidenceReceipt } from "@/lib/confidence";
import { STATUS_LABELS } from "@/lib/hypothesis-types";
import { computeStalenessFromReceipt } from "@/lib/staleness";

type Hypothesis = typeof hypotheses.$inferSelect;

export function ConfidenceReceiptCard({ hypothesis }: { hypothesis: Hypothesis }) {
  const receipt = hypothesis.confidenceReceipt as ConfidenceReceipt | null;
  const staleness = computeStalenessFromReceipt(receipt);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Confidence Score</p>
          <p className="text-3xl font-semibold text-slate-900">{hypothesis.confidenceScore ?? 0}</p>
        </div>
        <Badge>{STATUS_LABELS[hypothesis.status]}</Badge>
      </div>

      {staleness.isStale && (
        <div className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          ⏱ A evidência real mais recente tem {staleness.daysSinceLatest} dias. Considere revalidar
          esta hipótese com pesquisa nova — o Confidence Score já está penalizando isso via
          recência, mas o número sozinho não deixa isso óbvio.
        </div>
      )}

      {!receipt || receipt.items.length === 0 ? (
        <p className="text-sm text-slate-400">
          Ainda sem evidência real vinculada — o score é calculado deterministicamente, nunca
          declarado pela IA. Vá para a aba Evidence para adicionar a primeira.
        </p>
      ) : (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-indigo-600">
            Ver recibo completo do cálculo ({receipt.items.length} evidência(s) real(is))
          </summary>
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
              <div>Força favorável: <strong>{receipt.favorableStrength}</strong></div>
              <div>Força contrária: <strong>{receipt.contraryStrength}</strong></div>
              <div>Métodos distintos favoráveis: <strong>{receipt.distinctMethodsFavorable}</strong></div>
              <div>Multiplicador de diversidade: <strong>{receipt.diversityMultiplier}x</strong></div>
            </div>
            {receipt.notes.length > 0 && (
              <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                {receipt.notes.map((n, i) => (
                  <p key={i}>⚠ {n}</p>
                ))}
              </div>
            )}
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1">Evidência</th>
                  <th>Fav.</th>
                  <th>Método</th>
                  <th>Peso método</th>
                  <th>Recência</th>
                  <th>Amostra</th>
                  <th>Representat.</th>
                  <th>Força final</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item) => (
                  <tr key={item.evidenceId} className="border-t border-slate-100">
                    <td className="py-1 font-mono text-[10px] text-slate-400">{item.evidenceId.slice(0, 8)}</td>
                    <td>{item.favorable ? "✓" : "✗"}</td>
                    <td>{item.type}</td>
                    <td>{item.breakdown.methodWeight.toFixed(2)}</td>
                    <td>{item.breakdown.recencyFactor.toFixed(2)}</td>
                    <td>{item.breakdown.sampleFactor.toFixed(2)}</td>
                    <td>{item.breakdown.representativeness.toFixed(2)}</td>
                    <td className="font-medium">{item.strength.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}
