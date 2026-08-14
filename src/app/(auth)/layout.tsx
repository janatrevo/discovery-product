import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-4 inline-flex items-center justify-center rounded-xl px-5 py-3"
            style={{ background: "linear-gradient(180deg, #8B42FF 0%, #6518E5 100%)" }}
          >
            <Image src="/trevo-logo.png" alt="Trevo" width={130} height={29} priority className="h-7 w-auto" />
          </div>
          <p className="text-sm text-slate-500">Hipóteses, evidências e decisões — num só lugar.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
