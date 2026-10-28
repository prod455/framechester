export type ResearchOrder='recent'|'demand'|'competition'|'feasibility';
export function orderResearch<T extends {updatedAt:string;demandScore:number;competitionScore:number;feasibilityScore:number}>(rows:readonly T[],order:ResearchOrder):T[] {
  return [...rows].sort((a,b)=>{
    const difference=order==='demand'?b.demandScore-a.demandScore:order==='competition'?a.competitionScore-b.competitionScore:order==='feasibility'?b.feasibilityScore-a.feasibilityScore:0;
    return difference||b.updatedAt.localeCompare(a.updatedAt);
  });
}
