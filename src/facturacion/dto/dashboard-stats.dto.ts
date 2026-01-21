export class DashboardStatsResponse {
  summary: {
    totalFacturado: StatMetric;
    ahorroFiscal: StatMetric;
    facturasEmitidas: StatMetric;
    solicitudesActivas: StatMetric;
  };
  recentRequests: any[];
  businessNetwork: {
    activePlatforms: number;
    regions: number;
    topPlatforms: { name: string; percentage: number }[];
  };
  charts: {
    monthlyPerformance: { month: string; facturado: number; ahorro: number }[];
    weeklyTrend: { week: string; volumen: number }[];
  }
}

class StatMetric {
  value: number;
  percentageChange: number;
}
