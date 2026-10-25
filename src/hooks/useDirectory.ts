import { useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import type { Dome, HomeSummary, Id, Settlement } from "@/api/contracts";

export interface DirectoryHome extends HomeSummary {
  dome: Dome;
  settlement: Settlement;
}

export interface Directory {
  settlements: Settlement[];
  domes: Dome[];
  homes: DirectoryHome[];
  homeById: Map<Id, DirectoryHome>;
  homeByCode: Map<string, DirectoryHome>;
}

/** Every settlement, dome and home, for lookups (incident rows, search). Static enough to cache. */
export function useDirectory() {
  return useQuery({
    queryKey: ["directory"],
    staleTime: Infinity,
    queryFn: async (): Promise<Directory> => {
      const settlements = await api.listSettlements();
      const domes = (await Promise.all(settlements.map((s) => api.listDomes(s.id)))).flat();
      const homeLists = await Promise.all(domes.map((d) => api.listHomes(d.id)));
      const homes: DirectoryHome[] = homeLists.flatMap((list, i) =>
        list.map((h) => ({ ...h, dome: domes[i], settlement: settlements.find((s) => s.id === domes[i].settlementId)! })),
      );
      return {
        settlements,
        domes,
        homes,
        homeById: new Map(homes.map((h) => [h.id, h])),
        homeByCode: new Map(homes.map((h) => [h.code, h])),
      };
    },
  });
}
