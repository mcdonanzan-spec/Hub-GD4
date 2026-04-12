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

interface FilterConfig {
  column: string;
  value: string | string[];
}

export const DynamicAnalytics: React.FC<DynamicAnalyticsProps> = ({ data, type }) => {
  const [groupBy, setGroupBy] = useState<string>('');
  const [filters, setFilters] = useState<FilterConfig[]>([
    { column: '', value: 'ALL' },
    { column: '', value: 'ALL' },
    { column: '', value: 'ALL' }
  ]);
  const [chartType, setChartType] = useState<'bar' | 'pie' | 'line'>('bar');
  const [showWorksiteSelector, setShowWorksiteSelector] = useState(false);

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

  // Pre-calculate unique values for all columns to avoid expensive iterations during render
  const allColumnValues = useMemo(() => {
    if (data.length === 0) return {};
    const valuesMap: Record<string, string[]> = {};
    
    availableColumns.forEach(col => {
      const values = new Set<string>();
      data.forEach(item => {
        const val = item.rawData?.[col.key];
        if (val !== null && val !== undefined && val !== "") {
          values.add(String(val));
        }
      });
      valuesMap[col.key] = Array.from(values).sort();
    });
    
    return valuesMap;
  }, [data, availableColumns]);

  // Extract unique values for a specific column from pre-calculated map
  const getColumnValues = (columnKey: string) => {
    return allColumnValues[columnKey] || [];
  };

  // Set default groupBy and filters if not set
  React.useEffect(() => {
    if (!groupBy && availableColumns.length > 0) {
      const defaultCol = availableColumns.find((c: any) => 
        ['STATUS', 'OBRA', 'SITUACAO', 'LOCAL'].includes(c.key.toUpperCase())
      ) || availableColumns[0];
      setGroupBy(defaultCol.key);
    }
    
    // Initialize first filter with 'OBRA' if available
    if (availableColumns.length > 0 && !filters[0].column) {
      const obraCol = availableColumns.find((c: any) => 
        ['OBRA', 'LOCAL', 'PROJETO'].includes(c.key.toUpperCase())
      );
      if (obraCol) {
        setFilters(prev => {
          const newFilters = [...prev];
          newFilters[0].column = obraCol.key;
          return newFilters;
        });
      }
    }
  }, [availableColumns, groupBy]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      return filters.every(f => {
        if (!f.column || f.value === 'ALL') return true;
        const itemValue = String(item.rawData?.[f.column] || '');
        if (Array.isArray(f.value)) {
          return f.value.includes(itemValue);
        }
        return itemValue === f.value;
      });
    });
  }, [data, filters]);

  const updateFilter = (index: number, column: string, value: string | string[]) => {
    setFilters(prev => {
      const newFilters = [...prev];
      newFilters[index] = { column, value };
      return newFilters;
    });
  };

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
      {/* Quick Guide for common tasks */}
      <div className="bg-blue-600 text-white p-6 rounded-3xl shadow-lg shadow-blue-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <BarChart3 size={24} />
          </div>
          <div>
            <h4 className="font-bold text-lg">Como fazer sua análise?</h4>
            <p className="text-sm text-blue-100">Siga os passos abaixo para extrair as informações que precisa.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 max-w-2xl">
          <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Passo 1: Filtrar Obra</p>
            <p className="text-xs font-medium">Nos "Filtros de Dados", selecione a coluna <span className="font-bold underline">OBRA</span> e escolha a obra desejada.</p>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Passo 2: Ver Documentação Mensal</p>
            <p className="text-xs font-medium">Em "Ver Gráfico Por", selecione <span className="font-bold underline">MÊS DE REFERÊNCIA</span> para ver a evolução no tempo.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Filtros de Dados</label>
              <p className="text-[10px] text-gray-500 font-medium">Combine até 3 critérios para refinar sua análise</p>
            </div>
            <button 
              onClick={() => setFilters(prev => prev.map(f => ({ ...f, value: 'ALL' })))}
              className="text-[10px] font-bold text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded-lg"
            >
              Limpar Tudo
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filters.map((f, idx) => {
              const values = getColumnValues(f.column);
              const isMultiSelect = f.column.toUpperCase().includes('OBRA') || f.column.toUpperCase().includes('LOCAL');

              return (
                <div key={idx} className="space-y-2 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                  <select 
                    value={f.column}
                    onChange={(e) => updateFilter(idx, e.target.value, 'ALL')}
                    className="w-full bg-transparent text-[10px] font-black text-gray-500 uppercase tracking-tighter focus:outline-none cursor-pointer"
                  >
                    <option value="">SELECIONAR COLUNA...</option>
                    {availableColumns.map((col: any) => (
                      <option key={col.key} value={col.key}>{col.label}</option>
                    ))}
                  </select>

                  {f.column && (
                    <div className="relative">
                      {isMultiSelect ? (
                        <div className="relative">
                          <button 
                            onClick={() => setShowWorksiteSelector(idx === 0 ? !showWorksiteSelector : false)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-left flex items-center justify-between"
                          >
                            <span className="truncate">
                              {f.value === 'ALL' ? 'TODOS SELECIONADOS' : Array.isArray(f.value) ? `${f.value.length} SELECIONADOS` : f.value}
                            </span>
                            <ChevronDown size={14} className="text-gray-400" />
                          </button>
                          
                          {showWorksiteSelector && idx === 0 && (
                            <div className="absolute z-30 mt-2 w-full bg-white border border-gray-200 rounded-2xl shadow-xl p-4 space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                              <div className="flex gap-2 border-b border-gray-100 pb-2">
                                <button 
                                  onClick={() => updateFilter(idx, f.column, 'ALL')}
                                  className="flex-1 text-[10px] font-bold bg-gray-900 text-white py-1 rounded-lg"
                                >
                                  TODOS
                                </button>
                                <button 
                                  onClick={() => updateFilter(idx, f.column, [])}
                                  className="flex-1 text-[10px] font-bold bg-gray-100 text-gray-600 py-1 rounded-lg"
                                >
                                  NENHUM
                                </button>
                              </div>
                              <div className="space-y-1">
                                {values.map(val => (
                                  <label key={val} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                                    <input 
                                      type="checkbox"
                                      checked={f.value === 'ALL' || (Array.isArray(f.value) && f.value.includes(val))}
                                      onChange={(e) => {
                                        let newValue: string[] = [];
                                        if (f.value === 'ALL') {
                                          newValue = values.filter(v => v !== val);
                                        } else if (Array.isArray(f.value)) {
                                          newValue = e.target.checked 
                                            ? [...f.value, val] 
                                            : f.value.filter(v => v !== val);
                                        }
                                        updateFilter(idx, f.column, newValue.length === values.length ? 'ALL' : newValue);
                                      }}
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-xs font-medium text-gray-700 truncate">{val}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <select 
                          value={Array.isArray(f.value) ? 'ALL' : f.value}
                          onChange={(e) => updateFilter(idx, f.column, e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                        >
                          <option value="ALL">TODOS</option>
                          {values.map((val: string) => (
                            <option key={val} value={val}>{val}</option>
                          ))}
                        </select>
                      )}
                      {!isMultiSelect && <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Ver Gráfico Por:</label>
              <div className="group relative">
                <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-[10px] text-white rounded-lg shadow-xl z-50">
                  Isso define o que aparecerá na base do gráfico (Eixo X). Ex: Selecione "Mês" para ver a evolução mensal.
                </div>
                <span className="text-[10px] text-blue-500 cursor-help">O que é isso?</span>
              </div>
            </div>
            <div className="relative">
              <select 
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="w-full bg-gray-900 text-white border-none rounded-2xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
              >
                <option value="">SELECIONE UMA DIMENSÃO...</option>
                {availableColumns.map((col: any) => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
            </div>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-2xl">
            <button 
              onClick={() => setChartType('bar')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black transition-all ${chartType === 'bar' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <BarChart3 size={14} /> BARRA
            </button>
            <button 
              onClick={() => setChartType('pie')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black transition-all ${chartType === 'pie' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <PieChart size={14} /> PIZZA
            </button>
            <button 
              onClick={() => setChartType('line')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black transition-all ${chartType === 'line' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LineChart size={14} /> LINHA
            </button>
          </div>
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
            {groupBy ? (
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
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
                <div className="p-4 bg-white rounded-2xl shadow-sm">
                  <BarChart3 size={32} className="text-gray-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Nenhuma dimensão selecionada</p>
                  <p className="text-xs text-gray-500">Selecione uma opção em "Ver Gráfico Por" para gerar a visualização.</p>
                </div>
              </div>
            )}
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
