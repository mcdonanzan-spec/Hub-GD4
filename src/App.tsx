import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  Users, 
  User,
  MessageSquare, 
  LogOut, 
  Menu, 
  X,
  Bell,
  Search,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronLeft,
  Filter,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth, db, googleProvider, OperationType, handleFirestoreError } from './firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { getAIAssistance, suggestTasks } from './services/aiService';
import ReactMarkdown from 'react-markdown';
import { seedDatabase } from './seed';
import * as XLSX from 'xlsx';

// --- Types ---
interface Snapshot {
  id: string;
  type: 'COMPANY_DOCS' | 'EMPLOYEE_DOCS';
  referenceMonth: string;
  importDate: string;
  worksite?: string;
  contractorName?: string;
  cnpj?: string;
  status?: string;
  rawData: any;
  importedBy: string;
}

interface Appointment {
  id: string;
  title: string;
  date: string;
  type: 'VISITA' | 'REUNIAO' | 'REGULARIZACAO' | 'AUDITORIA';
  worksite?: string;
  contractorId?: string;
  description?: string;
  status: 'PLANEJADO' | 'REALIZADO' | 'CANCELADO';
  createdBy: string;
}

// --- Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = 'primary', className = "", disabled = false }: any) => {
  const variants: any = {
    primary: "bg-gray-900 text-white hover:bg-gray-800",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "bg-transparent text-gray-500 hover:bg-gray-100"
  };
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Badge = ({ status }: { status: string }) => {
  const styles: any = {
    APTO: "bg-emerald-50 text-emerald-700 border-emerald-100",
    BLOQUEADO: "bg-red-50 text-red-700 border-red-100",
    PENDENTE: "bg-amber-50 text-amber-700 border-amber-100",
    REALIZADO: "bg-blue-50 text-blue-700 border-blue-100",
    PLANEJADO: "bg-gray-50 text-gray-700 border-gray-100",
    CANCELADO: "bg-gray-100 text-gray-400 border-gray-200"
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status] || styles.PLANEJADO}`}>
      {status}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const { user, loading, isAdmin, isEditor } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [snapshotType, setSnapshotType] = useState<'COMPANY_DOCS' | 'EMPLOYEE_DOCS'>('COMPANY_DOCS');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [prompt, setPrompt] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, status: '', error: null as string | null });
  const [importModal, setImportModal] = useState<{ show: boolean, type: 'COMPANY_DOCS' | 'EMPLOYEE_DOCS' | null, file: File | null }>({ show: false, type: null, file: null });

  // Real-time data
  useEffect(() => {
    if (!user) return;

    const qSnapshots = query(collection(db, 'snapshots'), orderBy('importDate', 'desc'));
    const unsubSnapshots = onSnapshot(qSnapshots, (snapshot) => {
      setSnapshots(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Snapshot)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'snapshots'));

    const qAppointments = query(collection(db, 'appointments'), orderBy('date'));
    const unsubAppointments = onSnapshot(qAppointments, (snapshot) => {
      setAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));

    if (isAdmin) {
      const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const unsubUsers = onSnapshot(qUsers, (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
      return () => {
        unsubSnapshots();
        unsubAppointments();
        unsubUsers();
      };
    }

    return () => {
      unsubSnapshots();
      unsubAppointments();
    };
  }, [user, isAdmin]);

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'COMPANY_DOCS' | 'EMPLOYEE_DOCS') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportModal({ show: true, type, file });
    // Reset input so same file can be selected again if needed
    e.target.value = "";
  };

  const startImport = async () => {
    const { type, file } = importModal;
    if (!file || !type) return;

    const month = selectedMonth;
    setImportModal({ show: false, type: null, file: null });
    setIsImporting(true);
    setImportProgress({ current: 0, total: 0, status: 'Lendo arquivo...', error: null });
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        if (!bstr) throw new Error("Não foi possível ler o conteúdo do arquivo.");

        const wb = XLSX.read(bstr, { type: 'binary' });
        if (!wb.SheetNames.length) throw new Error("O arquivo Excel não possui planilhas.");

        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("A planilha parece estar vazia ou o formato não é suportado (certifique-se de que os dados estão na primeira aba).");
        }

        setImportProgress({ current: 0, total: data.length, status: 'Preparando dados...', error: null });

        // Helper to sanitize keys for Firestore (no dots, slashes, etc)
        const sanitizeKey = (key: string) => key.replace(/[\.\#\$\[\]\/]/g, '_');

        const batchSize = 400; // Firestore limit is 500, using 400 for safety
        for (let i = 0; i < data.length; i += batchSize) {
          const chunk = data.slice(i, i + batchSize);
          setImportProgress(prev => ({ ...prev, status: `Enviando lote ${Math.floor(i / batchSize) + 1} de ${Math.ceil(data.length / batchSize)}...` }));
          
          const batch = writeBatch(db);
          
          chunk.forEach((row: any) => {
            // Sanitize all keys in the row object
            const sanitizedRawData: any = {};
            Object.keys(row).forEach(key => {
              sanitizedRawData[sanitizeKey(key)] = row[key];
            });

            const snapshot: any = {
              type: type,
              referenceMonth: month,
              importDate: new Date().toISOString(),
              rawData: sanitizedRawData,
              importedBy: user?.uid || "anonymous",
              worksite: String(row.Obra || row.worksite || row.OBRA || row.Local || "Geral"),
              contractorName: String(row.Empresa || row.contractor || row.EMPRESA || row.Nome || row.Razão || "Sem Nome"),
              cnpj: String(row.CNPJ || row.cnpj || row.Cnpj || ""),
              status: String(row.Status || row.status || row.STATUS || "PENDENTE").toUpperCase(),
            };
            
            const docRef = doc(collection(db, 'snapshots'));
            batch.set(docRef, snapshot);
          });

          try {
            await batch.commit();
          } catch (batchErr: any) {
            console.error("Erro ao processar lote:", batchErr);
            throw new Error(`Erro no servidor ao processar lote ${Math.floor(i / batchSize) + 1}: ${batchErr.message}`);
          }
          
          setImportProgress(prev => ({ ...prev, current: Math.min(i + batchSize, data.length) }));
        }

        setImportProgress(prev => ({ ...prev, status: 'Importação concluída com sucesso!' }));
        setTimeout(() => {
          setIsImporting(false);
          setImportProgress({ current: 0, total: 0, status: '', error: null });
        }, 3000);
      } catch (error: any) {
        console.error("Erro Crítico na Importação:", error);
        setImportProgress(prev => ({ ...prev, status: 'Erro na importação', error: error.message }));
        // Don't close immediately so user can see the error
      }
    };
    reader.onerror = (err) => {
      setImportProgress(prev => ({ ...prev, status: 'Erro de leitura', error: "Erro ao ler o arquivo físico do seu computador." }));
    };
    reader.readAsBinaryString(file);
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const currentSnapshots = snapshots.filter(s => s.referenceMonth === selectedMonth && s.type === snapshotType);
  const totalEmpresas = currentSnapshots.length;
  const aptas = currentSnapshots.filter(s => s.status === 'APTO').length;
  const bloqueadas = currentSnapshots.filter(s => s.status === 'BLOQUEADO').length;
  const pendentes = currentSnapshots.filter(s => s.status === 'PENDENTE').length;

  const getIssuesByWorksite = (data: Snapshot[]) => {
    const worksites = Array.from(new Set(data.map(s => s.worksite)));
    return worksites.map(ws => ({
      name: ws,
      issues: data.filter(s => s.worksite === ws && (s.status === 'BLOQUEADO' || s.status === 'PENDENTE')).length
    }));
  };

  const handleSendMessage = async () => {
    if (!prompt.trim()) return;
    
    const userMsg = prompt;
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setPrompt("");
    setIsAiLoading(true);

    const context = {
      snapshots: currentSnapshots.map(s => ({ name: s.contractorName, status: s.status, worksite: s.worksite, type: s.type })),
      appointments: appointments.slice(0, 5).map(a => ({ title: a.title, date: a.date, type: a.type }))
    };

    const response = await getAIAssistance(userMsg, context);
    setAiMessages(prev => [...prev, { role: 'ai', content: response || "Erro ao processar." }]);
    setIsAiLoading(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center"
      >
        <div className="w-20 h-20 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg">
          <LayoutDashboard className="text-white w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Hub GD4</h1>
        <p className="text-gray-500 mb-10 leading-relaxed">
          Bem-vindo ao seu centro operacional de gestão de empreiteiras e rotina inteligente.
        </p>
        <Button onClick={handleLogin} className="w-full py-4 text-lg">
          Entrar com Google
        </Button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-white border-r border-gray-200 flex flex-col sticky top-0 h-screen z-30"
      >
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight">HUB GD4</span>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<CalendarIcon size={20} />} 
            label="Agenda" 
            active={activeTab === 'agenda'} 
            onClick={() => setActiveTab('agenda')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Users size={20} />} 
            label="Empreiteiras" 
            active={activeTab === 'contractors'} 
            onClick={() => setActiveTab('contractors')}
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<MessageSquare size={20} />} 
            label="Assistente IA" 
            active={activeTab === 'ai'} 
            onClick={() => setActiveTab('ai')}
            collapsed={!isSidebarOpen}
          />
          {isAdmin && (
            <NavItem 
              icon={<Users size={20} />} 
              label="Equipe" 
              active={activeTab === 'users'} 
              onClick={() => setActiveTab('users')}
              collapsed={!isSidebarOpen}
            />
          )}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className={`flex items-center gap-3 p-2 rounded-xl ${isSidebarOpen ? 'bg-gray-50' : ''}`}>
            <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{isAdmin ? 'Administrador' : 'Operador'}</p>
              </div>
            )}
            {isSidebarOpen && (
              <button onClick={handleLogout} className="text-gray-400 hover:text-red-500">
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-20 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-semibold text-gray-900 capitalize">{activeTab}</h2>
            {(activeTab === 'dashboard' || activeTab === 'contractors') && (
              <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer"
                />
                <div className="h-4 w-px bg-gray-300 mx-1" />
                <select 
                  value={snapshotType}
                  onChange={(e) => setSnapshotType(e.target.value as any)}
                  className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer"
                >
                  <option value="COMPANY_DOCS">Empresas</option>
                  <option value="EMPLOYEE_DOCS">Colaboradores</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="h-8 w-px bg-gray-200"></div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock size={16} />
              {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {/* Import Confirmation Modal */}
          <AnimatePresence>
            {importModal.show && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8"
                >
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                    <Plus className="text-blue-600 w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Confirmar Importação</h3>
                  <p className="text-gray-500 mb-6">
                    Você está prestes a importar dados de <strong>{importModal.type === 'COMPANY_DOCS' ? 'Empresas' : 'Colaboradores'}</strong> para o mês de <strong>{selectedMonth}</strong>.
                  </p>
                  <div className="flex gap-3">
                    <Button 
                      variant="secondary" 
                      className="flex-1" 
                      onClick={() => setImportModal({ show: false, type: null, file: null })}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      className="flex-1 bg-blue-600 hover:bg-blue-700" 
                      onClick={startImport}
                    >
                      Iniciar Agora
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {isImporting && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <Card className={`p-6 border-2 ${importProgress.error ? 'border-red-200 bg-red-50' : 'border-blue-100 bg-blue-50/30'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${importProgress.error ? 'bg-red-600' : 'bg-blue-600 animate-pulse'}`}>
                      {importProgress.error ? <AlertTriangle size={20} /> : <Plus size={20} />}
                    </div>
                    <div>
                      <h3 className={`font-bold ${importProgress.error ? 'text-red-900' : 'text-blue-900'}`}>
                        {importProgress.error ? 'Falha na Importação' : (importProgress.status || "Processando Planilha...")}
                      </h3>
                      <p className={`text-sm ${importProgress.error ? 'text-red-600' : 'text-blue-600'}`}>
                        {importProgress.error ? importProgress.error : 'Enviando dados para o sistema de forma segura.'}
                      </p>
                    </div>
                  </div>
                  {!importProgress.error && (
                    <div className="text-right">
                      <span className="text-2xl font-black text-blue-900">
                        {importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%
                      </span>
                      <p className="text-xs text-blue-500 font-medium uppercase tracking-wider">
                        {importProgress.current} de {importProgress.total} registros
                      </p>
                    </div>
                  )}
                  {importProgress.error && (
                    <Button 
                      variant="secondary" 
                      className="bg-white border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setIsImporting(false);
                        setImportProgress({ current: 0, total: 0, status: '', error: null });
                      }}
                    >
                      Fechar e Tentar Novamente
                    </Button>
                  )}
                </div>
                {!importProgress.error && (
                  <div className="h-3 bg-blue-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-blue-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                    />
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="flex justify-end -mb-6">
                  {isAdmin && (
                    <Button variant="ghost" className="text-[10px] opacity-10 hover:opacity-100" onClick={seedDatabase}>
                      Seed Data
                    </Button>
                  )}
                </div>
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard 
                    title="Total Registros" 
                    value={totalEmpresas} 
                    icon={<Users className="text-blue-600" />} 
                    trend={`${selectedMonth}`}
                  />
                  <StatCard 
                    title="Aptas" 
                    value={aptas} 
                    icon={<CheckCircle2 className="text-emerald-600" />} 
                    color="emerald"
                  />
                  <StatCard 
                    title="Bloqueadas" 
                    value={bloqueadas} 
                    icon={<AlertTriangle className="text-red-600" />} 
                    color="red"
                  />
                  <StatCard 
                    title="Pendentes" 
                    value={pendentes} 
                    icon={<Clock className="text-amber-600" />} 
                    color="amber"
                  />
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-6">Status Geral ({snapshotType === 'COMPANY_DOCS' ? 'Empresas' : 'Colaboradores'})</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Apto', value: aptas },
                              { name: 'Bloqueado', value: bloqueadas },
                              { name: 'Pendente', value: pendentes },
                            ]}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            <Cell fill="#10b981" />
                            <Cell fill="#ef4444" />
                            <Cell fill="#f59e0b" />
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-6">Problemas por Obra</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getIssuesByWorksite(currentSnapshots)}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="issues" fill="#1e293b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>

                {/* Critical List */}
                <Card>
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Registros Críticos</h3>
                    <Button variant="secondary" className="text-sm">Ver Todos</Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                          <th className="px-6 py-4 font-medium">Entidade</th>
                          <th className="px-6 py-4 font-medium">Obra</th>
                          <th className="px-6 py-4 font-medium">Status</th>
                          <th className="px-6 py-4 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {currentSnapshots.filter(s => s.status !== 'APTO').slice(0, 5).map(s => (
                          <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-900">{s.contractorName}</td>
                            <td className="px-6 py-4 text-gray-500 text-sm">{s.worksite}</td>
                            <td className="px-6 py-4"><Badge status={s.status as any} /></td>
                            <td className="px-6 py-4 text-right">
                              <button className="p-2 hover:bg-gray-200 rounded-lg text-gray-400">
                                <MoreVertical size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'agenda' && (
              <motion.div 
                key="agenda"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Calendar View */}
                  <div className="flex-1">
                    <Calendar appointments={appointments} />
                  </div>

                  {/* Upcoming Tasks */}
                  <div className="w-full lg:w-80 space-y-6">
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold">Próximas Atividades</h3>
                        {isEditor && <button className="p-1 hover:bg-gray-100 rounded"><Plus size={18} /></button>}
                      </div>
                      <div className="space-y-4">
                        {appointments.filter(a => new Date(a.date) >= new Date()).slice(0, 5).map(a => (
                          <div key={a.id} className="flex gap-4 group cursor-pointer">
                            <div className="flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-gray-900 mt-2"></div>
                              <div className="w-px flex-1 bg-gray-100 my-1"></div>
                            </div>
                            <div className="flex-1 pb-4">
                              <p className="text-xs text-gray-400 font-medium uppercase">{format(new Date(a.date), "HH:mm")}</p>
                              <p className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{a.title}</p>
                              <p className="text-xs text-gray-500">{a.worksite}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card className="p-6 bg-gray-900 text-white border-none">
                      <h3 className="font-semibold mb-2">Sugestão da IA</h3>
                      <p className="text-sm text-gray-400 mb-6">Baseado nas empresas bloqueadas, você deveria agendar uma auditoria na Obra Alpha.</p>
                      <Button variant="secondary" className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20">
                        Criar Tarefa
                      </Button>
                    </Card>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'contractors' && (
              <motion.div 
                key="contractors"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                  <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome, CNPJ ou obra..." 
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/5 transition-all"
                    />
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="secondary"><Filter size={18} /> Filtros</Button>
                    {isEditor && (
                      <div className="flex gap-2">
                        <div className="relative">
                          <input 
                            type="file" 
                            accept=".xlsx, .xls, .csv" 
                            onChange={(e) => handleFileUpload(e, 'COMPANY_DOCS')}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            disabled={isImporting}
                          />
                          <Button variant="secondary" disabled={isImporting}>
                            <Plus size={18} /> {isImporting ? '...' : 'Subir Empresas'}
                          </Button>
                        </div>
                        <div className="relative">
                          <input 
                            type="file" 
                            accept=".xlsx, .xls, .csv" 
                            onChange={(e) => handleFileUpload(e, 'EMPLOYEE_DOCS')}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            disabled={isImporting}
                          />
                          <Button variant="secondary" disabled={isImporting}>
                            <Plus size={18} /> {isImporting ? '...' : 'Subir Colaboradores'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {currentSnapshots.map(s => (
                    <Card key={s.id} className="p-6 hover:border-gray-300 transition-all cursor-pointer group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-gray-900 group-hover:text-white transition-colors">
                          {s.type === 'COMPANY_DOCS' ? <Users size={24} /> : <User size={24} />}
                        </div>
                        <Badge status={s.status as any} />
                      </div>
                      <h4 className="font-bold text-lg mb-1">{s.contractorName}</h4>
                      <p className="text-sm text-gray-500 mb-4">{s.worksite}</p>
                      <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                        <span className="text-xs text-gray-400">CNPJ: {s.cnpj || '---'}</span>
                        <button className="text-gray-900 font-semibold text-sm flex items-center gap-1">
                          Ver Dados <ChevronRight size={16} />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'ai' && (
              <motion.div 
                key="ai"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-[calc(100vh-180px)] flex flex-col"
              >
                <Card className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                      <MessageSquare size={18} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">Assistente GD4</h3>
                      <p className="text-xs text-gray-500">Inteligência Artificial conectada aos seus dados</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {aiMessages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                          <MessageSquare size={32} className="text-gray-300" />
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-2">Como posso ajudar hoje?</h4>
                        <p className="text-sm text-gray-500">Pergunte sobre o status das obras, peça para organizar sua semana ou analise pendências críticas.</p>
                        <div className="grid grid-cols-1 gap-2 mt-8 w-full">
                          <button onClick={() => setPrompt("Quais empresas estão bloqueadas?")} className="text-xs p-3 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 text-left">"Quais empresas estão bloqueadas?"</button>
                          <button onClick={() => setPrompt("Resuma minha agenda desta semana")} className="text-xs p-3 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 text-left">"Resuma minha agenda desta semana"</button>
                        </div>
                      </div>
                    )}
                    {aiMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isAiLoading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 p-4 rounded-2xl flex gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-gray-100">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Digite sua pergunta..." 
                        className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/5"
                      />
                      <Button onClick={handleSendMessage} disabled={isAiLoading}>Enviar</Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'users' && isAdmin && (
              <motion.div 
                key="users"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <Card>
                  <div className="p-6 border-b border-gray-100">
                    <h3 className="text-lg font-semibold">Gerenciar Equipe</h3>
                    <p className="text-sm text-gray-500">Defina quem pode editar a agenda ou apenas visualizar.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                          <th className="px-6 py-4 font-medium">Usuário</th>
                          <th className="px-6 py-4 font-medium">Email</th>
                          <th className="px-6 py-4 font-medium">Nível de Acesso</th>
                          <th className="px-6 py-4 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {users.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-medium text-gray-900">{u.displayName}</td>
                            <td className="px-6 py-4 text-gray-500 text-sm">{u.email}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                u.role === 'admin' ? 'bg-purple-50 text-purple-700' :
                                u.role === 'editor' ? 'bg-blue-50 text-blue-700' :
                                'bg-gray-50 text-gray-600'
                              }`}>
                                {u.role === 'admin' ? 'Administrador' : u.role === 'editor' ? 'Equipe (Editor)' : 'Empresa (Visualizador)'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <select 
                                value={u.role} 
                                onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                disabled={u.email === 'mcdonanzan@gmail.com'}
                                className="text-sm bg-white border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-900/5"
                              >
                                <option value="viewer">Visualizador</option>
                                <option value="editor">Editor (Equipe)</option>
                                <option value="admin">Administrador</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// --- Sub-components ---

function NavItem({ icon, label, active, onClick, collapsed }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
        active 
          ? 'bg-gray-900 text-white shadow-lg shadow-gray-900/10' 
          : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {icon}
      {!collapsed && <span className="font-medium">{label}</span>}
    </button>
  );
}

function StatCard({ title, value, icon, trend, color = "gray" }: any) {
  const colors: any = {
    gray: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600"
  };
  return (
    <Card className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${colors[color]}`}>
          {icon}
        </div>
        {trend && <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{trend}</span>}
      </div>
      <p className="text-sm text-gray-500 font-medium mb-1">{title}</p>
      <h4 className="text-3xl font-bold text-gray-900">{value}</h4>
    </Card>
  );
}

function Calendar({ appointments }: { appointments: Appointment[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = addDays(startOfWeek(monthEnd), 6);

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xl font-bold text-gray-900">
            {format(currentDate, "MMMM yyyy", { locale: ptBR })}
          </h3>
          <p className="text-sm text-gray-500">Visualize sua rotina mensal</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
          <div key={day} className="bg-gray-50 p-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
            {day}
          </div>
        ))}
        {days.map((day, i) => {
          const dayAppointments = appointments.filter(a => isSameDay(new Date(a.date), day));
          return (
            <div 
              key={i} 
              className={`bg-white min-h-[120px] p-2 transition-all hover:bg-gray-50 cursor-pointer ${
                !isSameDay(day, monthStart) && day.getMonth() !== monthStart.getMonth() ? 'opacity-30' : ''
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                  isToday(day) ? 'bg-gray-900 text-white' : 'text-gray-700'
                }`}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-1">
                {dayAppointments.slice(0, 3).map(a => (
                  <div key={a.id} className="text-[10px] p-1 bg-gray-100 rounded border-l-2 border-gray-900 truncate font-medium">
                    {a.title}
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <div className="text-[10px] text-gray-400 text-center font-medium">
                    + {dayAppointments.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// --- Helpers ---

function getIssuesByWorksite(data: Snapshot[]) {
  const worksites: any = {};
  data.forEach(s => {
    const ws = s.worksite || 'Geral';
    if (!worksites[ws]) worksites[ws] = 0;
    if (s.status !== 'APTO') worksites[ws] += 1;
  });
  return Object.keys(worksites).map(name => ({ name, issues: worksites[name] }));
}
