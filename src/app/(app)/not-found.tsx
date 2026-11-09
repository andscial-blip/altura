import { Empty, Head } from "@/components/Head";

export default function NotFound() {
  return (
    <div className="stack-l">
      <Head title="Non trovato" />
      <div className="card"><Empty icon="activity" title="Questa pagina o attività non esiste più" text="Può succedere se un'attività è stata unita a un'altra (stessa uscita da due fonti) o eliminata." action={{ href: "/attivita", label: "Vai alle attività" }} /></div>
    </div>
  );
}
