import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell,
  LineChart as ReLineChart,
  Line,
  Legend
} from 'recharts';
import { BarChart3, PieChart, LineChart, Table, Download, ChevronDown } from 'lucide-react';

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

interface DynamicAnalyticsProps {
  data: any[];
  type: 'COMPANY_DOCS' | 'EMPLOYEE_DOCS';
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export const DynamicAnalytics: React.FC<DynamicAnalyticsProps> = ({ data, type }) => {
  const [groupBy, setGroupBy] = useState<string>('');
  const [filterBy, setFilterBy] = useState<string>('');
  const [filterValue, setFilterValue] = useState<string>('ALL');
  const [chartType, setChartType] = useState<'bar' | 'pie' | 'line'>('bar');

  // Extract all possible keys from the data
  const availableColumns = useMemo(() => {
    if (data.length === 0) return [];
    const first = data[0];
    const keys = first.columnOrder || Object.keys(first.rawData || {});
    return keys.map((k: string) => ({
      key: k,
      label: k.replace(/_/g, ' ').toUpperCase()
    }));
  }, [data]);

  // Extract unique values for the selected filter column
  const filterValues = useMemo(() => {
    if (!filterBy || data.length === 0) return [];
    const values = new Set<string>();
    data.forEach(item => {
      const val = item.rawData?.[filterBy];
      if (val !== null && val !== undefined && val !== "") {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  }, [data, filterBy]);

  // Set default groupBy if not set
  React.useEffect(() => {
    if (!groupBy && availableColumns.length > 0) {
      const defaultCol = availableColumns.find((c: any) => 
        ['STATUS', 'OBRA', 'SITUACAO', 'LOCAL'].includes(c.key.toUpperCase())
      ) || availableColumns[0];
      setGroupBy(defaultCol.key);
    }
    if (!filterBy && availableColumns.length > 0) {
      const defaultFilter = availableColumns.find((c: any) => 
        ['OBRA', 'LOCAL', 'PROJETO'].includes(c.key.toUpperCase())
      ) || availableColumns[0];
      setFilterBy(defaultFilter.key);
    }
  }, [availableColumns, groupBy, filterBy]);

  const filteredData = useMemo(() => {
    if (filterValue === 'ALL') return data;
    return data.filter(item => String(item.rawData?.[filterBy]) === filterValue);
  }, [data, filterBy, filterValue]);

  const chartData = useMemo(() => {
    if (!groupBy || filteredData.length === 0) return [];

    const counts: Record<string, number> = {};
    filteredData.forEach(item => {
      const val = item.rawData?.[groupBy] || 'Não Informado';
      counts[val] = (counts[val] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData, groupBy]);

  if (data.length === 0) {
    return (
      <div className="p-12 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
        <p className="text-gray-500 font-medium">Nenhum dado disponível para análise dinâmica.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">1. Filtrar por</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <select 
                value={filterBy}
                onChange={(e) => { setFilterBy(e.target.value); setFilterValue('ALL'); }}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
              >
                {availableColumns.map((col: any) => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative flex-1">
              <select 
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="w-full bg-blue-50 border border-blue-100 text-blue-700 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
              >
                <option value="ALL">TODOS</option>
                {filterValues.map((val: string) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">2. Agrupar por</label>
          <div className="relative">
            <select 
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              {availableColumns.map((col: any) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">3. Tipo de Gráfico</label>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setChartType('bar')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-black transition-all ${chartType === 'bar' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <BarChart3 size={12} /> BARRA
            </button>
            <button 
              onClick={() => setChartType('pie')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-black transition-all ${chartType === 'pie' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <PieChart size={12} /> PIZZA
            </button>
            <button 
              onClick={() => setChartType('line')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-black transition-all ${chartType === 'line' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LineChart size={12} /> LINHA
            </button>
          </div>
        </div>

        <div className="flex items-end">
          <button className="w-full bg-gray-900 text-white rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-2 hover:bg-black transition-all">
            <Download size={14} /> EXPORTAR PDF/XLS
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm min-h-[400px]">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Representação Gráfica</h3>
              <p className="text-xs text-gray-400 font-medium">Exibindo distribuição por {groupBy.replace(/_/g, ' ')}</p>
            </div>
            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              {filteredData.length} REGISTROS FILTRADOS
            </span>
          </div>
          
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : chartType === 'pie' ? (
                <RePieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RePieChart>
              ) : (
                <ReLineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} />
                </ReLineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Table size={18} className="text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Tabela Dinâmica</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{groupBy || 'Categoria'}</th>
                  <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Qtd</th>
                  <th className="pb-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {chartData.map((item, index) => (
                  <tr key={index} className="group hover:bg-gray-50 transition-all">
                    <td className="py-3 text-sm font-medium text-gray-700 truncate max-w-[150px]">{item.name}</td>
                    <td className="py-3 text-sm font-bold text-gray-900 text-right">{item.value}</td>
                    <td className="py-3 text-right">
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {Math.round((item.value / filteredData.length) * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 font-medium">Total Filtrado</span>
              <span className="text-gray-900 font-black">{filteredData.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
