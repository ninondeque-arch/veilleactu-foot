// Tableau de bord de reporting. TOUTES LES DONNÉES SONT FICTIVES (démo).

type Ligne = { carrousel: string; plateforme: "TikTok" | "Instagram" | "LinkedIn"; vues: number; engagements: number; sauvegardes: number; partages: number };

const DONNEES: Ligne[] = [
  { carrousel: "Un mème devient une crise (Mbappé / Chine)", plateforme: "TikTok", vues: 48200, engagements: 3150, sauvegardes: 610, partages: 540 },
  { carrousel: "Un mème devient une crise (Mbappé / Chine)", plateforme: "Instagram", vues: 21400, engagements: 1890, sauvegardes: 980, partages: 310 },
  { carrousel: "Un mème devient une crise (Mbappé / Chine)", plateforme: "LinkedIn", vues: 9600, engagements: 520, sauvegardes: 140, partages: 95 },
  { carrousel: "Rumeur de transfert démentie en 24 h", plateforme: "TikTok", vues: 31800, engagements: 1720, sauvegardes: 290, partages: 260 },
  { carrousel: "Rumeur de transfert démentie en 24 h", plateforme: "Instagram", vues: 15100, engagements: 1120, sauvegardes: 520, partages: 150 },
  { carrousel: "Rumeur de transfert démentie en 24 h", plateforme: "LinkedIn", vues: 6200, engagements: 310, sauvegardes: 85, partages: 40 },
  { carrousel: "Fausse vidéo d'arbitrage virale", plateforme: "TikTok", vues: 56900, engagements: 4080, sauvegardes: 720, partages: 910 },
  { carrousel: "Fausse vidéo d'arbitrage virale", plateforme: "Instagram", vues: 24300, engagements: 2210, sauvegardes: 1240, partages: 420 },
  { carrousel: "Fausse vidéo d'arbitrage virale", plateforme: "LinkedIn", vues: 11800, engagements: 760, sauvegardes: 230, partages: 150 },
];

const PLATEFORMES = ["TikTok", "Instagram", "LinkedIn"] as const;
const nf = new Intl.NumberFormat("fr-FR");
const pct = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;

function somme(lignes: Ligne[]) {
  return lignes.reduce(
    (t, l) => ({ vues: t.vues + l.vues, engagements: t.engagements + l.engagements, sauvegardes: t.sauvegardes + l.sauvegardes, partages: t.partages + l.partages }),
    { vues: 0, engagements: 0, sauvegardes: 0, partages: 0 },
  );
}

export default function Reporting() {
  const total = somme(DONNEES);
  const parPlateforme = PLATEFORMES.map((p) => ({ p, ...somme(DONNEES.filter((l) => l.plateforme === p)) }));
  const tauxMax = Math.max(...parPlateforme.map((x) => x.engagements / x.vues));
  const carrousels = [...new Set(DONNEES.map((l) => l.carrousel))];

  return (
    <div className="page">
      <div className="ligne-flex" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 26 }}>Reporting des carrousels publiés</h1>
        <span className="fictif">Démo — données fictives</span>
      </div>
      <p className="muet" style={{ margin: "6px 0 20px" }}>
        3 carrousels × 3 plateformes. Aucune de ces statistiques ne provient d'un compte réel.
      </p>

      <div className="kpis">
        <div className="carte kpi"><div className="libelle">Vues</div><div className="valeur">{nf.format(total.vues)}</div></div>
        <div className="carte kpi"><div className="libelle">Engagements</div><div className="valeur">{nf.format(total.engagements)}</div></div>
        <div className="carte kpi"><div className="libelle">Taux d'engagement</div><div className="valeur">{pct(total.engagements / total.vues)}</div></div>
        <div className="carte kpi"><div className="libelle">Sauvegardes</div><div className="valeur">{nf.format(total.sauvegardes)}</div></div>
      </div>

      <section className="section carte">
        <h2 style={{ fontSize: 16 }}>Taux d'engagement par plateforme</h2>
        <p className="petit muet" style={{ marginTop: 4 }}>Engagements ÷ vues, tous carrousels confondus (fictif).</p>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }} role="img" aria-label="Taux d'engagement par plateforme">
          {parPlateforme.map((x) => {
            const taux = x.engagements / x.vues;
            return (
              <div key={x.p} style={{ display: "grid", gridTemplateColumns: "90px 1fr 70px", alignItems: "center", gap: 12 }} title={`${x.p} : ${pct(taux)} (${nf.format(x.engagements)} engagements / ${nf.format(x.vues)} vues)`}>
                <span style={{ fontWeight: 550 }}>{x.p}</span>
                <div style={{ background: "#eef0f3", borderRadius: 4, height: 18 }}>
                  <div style={{ width: `${(taux / tauxMax) * 100}%`, height: "100%", background: "var(--nuit)", borderRadius: "0 4px 4px 0" }} />
                </div>
                <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{pct(taux)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section carte">
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Détail par carrousel et par plateforme</h2>
        <table className="tableau">
          <thead>
            <tr>
              <th>Carrousel</th><th>Plateforme</th><th className="nb">Vues</th><th className="nb">Engagements</th>
              <th className="nb">Taux</th><th className="nb">Sauvegardes</th><th className="nb">Partages</th>
            </tr>
          </thead>
          <tbody>
            {carrousels.flatMap((c) =>
              DONNEES.filter((l) => l.carrousel === c).map((l, i) => (
                <tr key={c + l.plateforme}>
                  <td>{i === 0 ? c : ""}</td>
                  <td>{l.plateforme}</td>
                  <td className="nb">{nf.format(l.vues)}</td>
                  <td className="nb">{nf.format(l.engagements)}</td>
                  <td className="nb">{pct(l.engagements / l.vues)}</td>
                  <td className="nb">{nf.format(l.sauvegardes)}</td>
                  <td className="nb">{nf.format(l.partages)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        <p className="petit muet" style={{ marginBottom: 0 }}>
          Lecture (fictive) : Instagram génère le plus de sauvegardes par vue, signe d'un contenu « à garder » ; TikTok apporte le volume.
        </p>
      </section>
    </div>
  );
}
