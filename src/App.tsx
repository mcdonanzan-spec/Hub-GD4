import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  Users, 
  User,
  MessageSquare, 
  LogOut, 
  LogIn,
  List,
  Grid,
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
  MoreVertical,
  Download
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
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp, updateDoc, doc, deleteDoc, writeBatch, where, getDocs } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { getAIAssistance, suggestTasks } from './services/aiService';
import ReactMarkdown from 'react-markdown';
import { seedDatabase } from './seed';
import * as XLSX from 'xlsx';

import { DynamicAnalytics } from './components/DynamicAnalytics';

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
  columnOrder?: string[];
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

export const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

export const Button = ({ children, onClick, variant = 'primary', className = "", disabled = false }: any) => {
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
  const { user, loading, isAdmin, isEditor, role } = useAuth();
  
  useEffect(() => {
    if (user) {
      console.log(`[Auth Debug] Usuário: ${user.email}, Role: ${role}, isEditor: ${isEditor}, isAdmin: ${isAdmin}`);
    } else {
      console.log(`[Auth Debug] Usuário não autenticado. Entrando em Modo Offline.`);
    }
  }, [user, role, isEditor, isAdmin]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [snapshotType, setSnapshotType] = useState<'COMPANY_DOCS' | 'EMPLOYEE_DOCS'>('COMPANY_DOCS');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [prompt, setPrompt] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ show: false, type: '' });
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, status: '', error: null as string | null });
  const [importModal, setImportModal] = useState<{ show: boolean, type: 'COMPANY_DOCS' | 'EMPLOYEE_DOCS' | null, file: File | null }>({ show: false, type: null, file: null });
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  
  // Local Persistence Logic
  useEffect(() => {
    const savedSnapshots = localStorage.getItem('gd4_snapshots_cache');
    if (savedSnapshots) {
      try {
        const parsed = JSON.parse(savedSnapshots);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[Persistence] Carregados ${parsed.length} registros do cache local.`);
          setSnapshots(parsed);
        }
      } catch (e) {
        console.error("[Persistence] Falha ao carregar cache local:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (snapshots.length > 0) {
      localStorage.setItem('gd4_snapshots_cache', JSON.stringify(snapshots));
    }
  }, [snapshots]);
  
  const tableContainerRef = React.useRef<HTMLDivElement>(null);
  const topScrollRef = React.useRef<HTMLDivElement>(null);

  // Dashboard Customization State
  const [dashboardConfig, setDashboardConfig] = useState({
    showStats: true,
    showPie: true,
    showBar: true,
    showCritical: true,
    showDynamic: false,
    layout: 'grid' as 'grid' | 'stack'
  });

  // Real-time data
  useEffect(() => {
    if (isDeleting) return;

    let unsubSnapshots = () => {};
    let unsubAppointments = () => {};
    let unsubUsers = () => {};

    if (user) {
      const qSnapshots = query(collection(db, 'snapshots'), orderBy('importDate', 'desc'));
      unsubSnapshots = onSnapshot(qSnapshots, (snapshot) => {
        const newSnapshots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Snapshot));
        console.log(`Snapshot recebido: ${snapshot.size} registros.`);
        setSnapshots(newSnapshots);
        localStorage.setItem('gd4_snapshots_cache', JSON.stringify(newSnapshots));
      }, (err) => {
        console.error("Firestore Snapshot Error:", err);
        // Don't throw if we have local data, just log
        if (snapshots.length === 0) {
          handleFirestoreError(err, OperationType.LIST, 'snapshots');
        }
      });

    const qAppointments = query(collection(db, 'appointments'), orderBy('date'));
    const unsubAppointments = onSnapshot(qAppointments, (snapshot) => {
      setAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));

    if (isAdmin) {
      const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const unsubUsers = onSnapshot(qUsers, (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
      }
    }

    return () => {
      unsubSnapshots();
      unsubAppointments();
      unsubUsers();
    };
  }, [user, isAdmin, isDeleting]);

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
      console.log("[Professional Import] Arquivo carregado. Iniciando motor de processamento...");
      try {
        const arrayBuffer = evt.target?.result;
        if (!arrayBuffer) throw new Error("Falha crítica: O arquivo não pôde ser lido da memória.");

        setImportProgress({ current: 0, total: 0, status: 'Analisando estrutura da planilha...', error: null });
        
        // Step 1: Parsing (Wrapped in a small delay to allow UI to update)
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const data = await new Promise<any[]>((resolve, reject) => {
          try {
            console.log("[Professional Import] Iniciando leitura do Excel...");
            const wb = XLSX.read(arrayBuffer, { type: 'array' });
            const wsName = wb.SheetNames[0];
            const ws = wb.Sheets[wsName];
            const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
            console.log(`[Professional Import] Leitura concluída: ${json.length} registros encontrados.`);
            resolve(json);
          } catch (e) { 
            console.error("[Professional Import] Erro na leitura do Excel:", e);
            reject(new Error("O arquivo Excel está corrompido ou em um formato não suportado.")); 
          }
        });

        if (!data || data.length === 0) throw new Error("A planilha selecionada está vazia.");

        const totalRecords = data.length;
        setImportProgress({ current: 0, total: totalRecords, status: 'Preparando sincronização...', error: null });

        // Step 2: Preparation (Pre-calculate mappings)
        const rowKeys = Object.keys(data[0] || {});
        const sanitizeKey = (key: string) => key.replace(/[\.\#\$\[\]\/]/g, '_');
        const sanitizedHeaders = rowKeys.map(h => sanitizeKey(h));
        
        const findK = (keys: string[]) => rowKeys.find(k => keys.includes(k.toUpperCase().trim()));
        const nameK = findK(type === 'COMPANY_DOCS' ? ['EMPRESA', 'CONTRACTOR', 'NOME', 'RAZÃO SOCIAL', 'FORNECEDOR'] : ['COLABORADOR', 'NOME', 'FUNCIONÁRIO']);
        const idK = findK(type === 'COMPANY_DOCS' ? ['CNPJ', 'IDENTIFICADOR'] : ['CPF', 'MATRÍCULA']);
        const statusK = findK(['STATUS', 'SITUAÇÃO', 'ESTADO']);
        const worksiteK = findK(['OBRA', 'WORKSITE', 'LOCAL', 'PROJETO']);

        // Step 3: Ultra-Turbo Parallel Upload
        const BATCH_SIZE = 500; // Maximum allowed by Firestore for peak performance
        const CONCURRENCY = 10; // High concurrency for near-instant processing
        let completed = 0;
        let failedBatches = 0;

        setImportProgress({ current: 0, total: totalRecords, status: 'Ativando Motor Ultra-Turbo...', error: null });
        await new Promise(resolve => setTimeout(resolve, 200));

        const uploadBatch = async (chunk: any[], batchIndex: number) => {
          const batch = writeBatch(db);
          
          // Optimization: Pre-process chunk to minimize work inside the loop
          chunk.forEach(row => {
            const compactData: any = {};
            // Only store non-empty values to keep documents "light"
            rowKeys.forEach(k => { 
              const val = row[k];
              if (val !== null && val !== undefined && val !== "") {
                compactData[sanitizeKey(k)] = val; 
              }
            });
            
            const docRef = doc(collection(db, 'snapshots'));
            batch.set(docRef, {
              type, 
              referenceMonth: month, 
              importDate: new Date().toISOString(),
              rawData: compactData, 
              columnOrder: sanitizedHeaders, 
              importedBy: user?.uid || "anonymous",
              worksite: String(row[worksiteK!] || "Geral").trim(),
              contractorName: String(row[nameK!] || rowKeys.find(k => typeof row[k] === 'string' && row[k].length > 3) || "Sem Nome").trim(),
              cnpj: String(row[idK!] || "").trim(),
              status: String(row[statusK!] || "PENDENTE").toUpperCase().trim(),
            });
          });
          
          let retries = 3;
          while (retries > 0) {
            try {
              await batch.commit();
              completed += chunk.length;
              
              // Update local cache immediately for resilience
              const currentData = [...snapshots];
              // This is a bit tricky since we don't have the full list here easily
              // but the onSnapshot will eventually catch up.
              // For now, let's just rely on the onSnapshot but ensure it's robust.
              
              // Smooth progress update
              setImportProgress(prev => ({ 
                ...prev, 
                current: completed, 
                status: `Sincronização Ultra-Rápida: ${completed} / ${totalRecords} (${Math.round((completed/totalRecords)*100)}%)` 
              }));
              return;
            } catch (e: any) {
              retries--;
              console.warn(`[Ultra-Turbo] Lote ${batchIndex} falhou. Tentando novamente...`, e);
              if (retries === 0) {
                failedBatches++;
                throw e;
              }
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        };

        const chunks = [];
        for (let i = 0; i < data.length; i += BATCH_SIZE) chunks.push(data.slice(i, i + BATCH_SIZE));

        const queue = [...chunks];
        const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(null).map(async (_, workerId) => {
          while (queue.length > 0) {
            const chunk = queue.shift();
            if (chunk) {
              const batchIndex = chunks.indexOf(chunk);
              try {
                await uploadBatch(chunk, batchIndex);
              } catch (e) {
                console.error(`[Ultra-Turbo] Worker ${workerId} falhou no lote ${batchIndex}.`);
              }
            }
          }
        });

        await Promise.all(workers);

        if (failedBatches > 0 && user) {
          throw new Error(`Importação concluída com ${failedBatches} lotes falhos devido à instabilidade de rede.`);
        }

        // Final fallback: if user is not logged in, we must ensure snapshots state is updated
        // so the user sees the data immediately in "Offline Mode"
        if (!user) {
          const localSnapshots = data.map((row, idx) => ({
            id: `local_${Date.now()}_${idx}`,
            type,
            referenceMonth: month,
            importDate: new Date().toISOString(),
            rawData: row,
            columnOrder: sanitizedHeaders,
            importedBy: "local",
            worksite: String(row[worksiteK!] || "Geral").trim(),
            contractorName: String(row[nameK!] || "Sem Nome").trim(),
            cnpj: String(row[idK!] || "").trim(),
            status: String(row[statusK!] || "PENDENTE").toUpperCase().trim(),
          }));
          const updatedSnapshots = [...localSnapshots, ...snapshots];
          setSnapshots(updatedSnapshots);
          localStorage.setItem('gd4_snapshots_cache', JSON.stringify(updatedSnapshots));
        }

        setImportProgress(prev => ({ ...prev, status: 'Sincronização concluída com sucesso!' }));
        setTimeout(() => { 
          setIsImporting(false); 
          setImportProgress({ current: 0, total: 0, status: '', error: null }); 
        }, 2000);

      } catch (error: any) {
        console.error("[Professional Import] Erro Fatal:", error);
        setImportProgress(prev => ({ ...prev, status: 'Erro na importação', error: error.message }));
      }
    };
    reader.onerror = (err) => {
      console.error("[Professional Import] Erro no FileReader:", err);
      setImportProgress(prev => ({ ...prev, status: 'Erro de leitura', error: "O navegador não conseguiu ler o arquivo físico." }));
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDeleteSnapshots = async (all = false) => {
    if (isDeleting) return;
    setDeleteModal({ show: false, type: '' });
    setIsDeleting(true);
    
    if (all) {
      localStorage.removeItem('gd4_snapshots_cache');
      setSnapshots([]);
    }
    
    setImportProgress({ 
      current: 0, 
      total: 100, // Placeholder until we count
      status: 'Iniciando limpeza profunda...', 
      error: null 
    });

    try {
      // Specialist approach: Fetch IDs directly from server to ensure we have the latest list
      // and bypass any client-side filtering issues
      const q = all 
        ? collection(db, 'snapshots')
        : query(collection(db, 'snapshots'), where('referenceMonth', '==', selectedMonth), where('type', '==', snapshotType));
      
      const querySnapshot = await getDocs(q);
      const targetIds = querySnapshot.docs.map(doc => doc.id);
      const total = targetIds.length;

      if (total === 0) {
        setImportProgress({ current: 0, total: 0, status: 'Nenhum registro encontrado para excluir.', error: null });
        setTimeout(() => setIsDeleting(false), 2000);
        return;
      }

      setImportProgress({ 
        current: 0, 
        total: total, 
        status: `Localizados ${total} registros. Iniciando remoção...`, 
        error: null 
      });

      const chunkSize = 15; // Smaller chunks for high reliability
      let processed = 0;
      
      for (let i = 0; i < targetIds.length; i += chunkSize) {
        const chunk = targetIds.slice(i, i + chunkSize);
        
        // Delete this chunk in parallel
        await Promise.all(chunk.map(async (id) => {
          try {
            await deleteDoc(doc(db, 'snapshots', id));
          } catch (err: any) {
            console.error(`Erro ao excluir ${id}:`, err);
            // If we hit a permission error, we want to know
            if (err.message?.includes('permission-denied')) {
              throw new Error("Permissão negada pelo servidor. Por favor, verifique se você é o administrador.");
            }
          }
        }));
        
        processed += chunk.length;
        
        setImportProgress(prev => ({ 
          ...prev, 
          current: processed,
          status: `Limpando base de dados... (${processed} de ${total})`
        }));
        
        // Small delay to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      setImportProgress(prev => ({ ...prev, status: 'Limpeza concluída com sucesso! Sincronizando...' }));
      
      // Wait for Firestore to propagate changes
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force reload to ensure everything is fresh
      window.location.reload();
      
    } catch (error: any) {
      console.error("Erro Crítico na Limpeza:", error);
      setImportProgress(prev => ({ 
        ...prev, 
        status: 'Falha na Limpeza',
        error: "Erro: " + (error.message || "Não foi possível completar a limpeza. Tente recarregar a página.")
      }));
      setIsDeleting(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const currentSnapshots = snapshots.filter(s => {
    const monthMatch = selectedMonth === 'ALL' ? true : s.referenceMonth === selectedMonth;
    const typeMatch = s.type === snapshotType;
    return monthMatch && typeMatch;
  });

  const [tableWidth, setTableWidth] = useState(0);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const tableContainer = tableContainerRef.current;
    const topScroll = topScrollRef.current;
    if (!tableContainer || !topScroll) return;

    const updateDimensions = () => {
      const scrollWidth = tableContainer.scrollWidth;
      const clientWidth = tableContainer.clientWidth;
      
      setTableWidth(scrollWidth);
      setIsOverflowing(scrollWidth > clientWidth + 2); // 2px buffer for safety
    };

    updateDimensions();
    // Multiple checks to ensure we catch the render
    const timer1 = setTimeout(updateDimensions, 100);
    const timer2 = setTimeout(updateDimensions, 500);
    const timer3 = setTimeout(updateDimensions, 1500);

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(tableContainer);

    const handleScroll = (source: HTMLDivElement, target: HTMLDivElement) => {
      if (Math.abs(target.scrollLeft - source.scrollLeft) > 0.5) {
        target.scrollLeft = source.scrollLeft;
      }
    };

    const onTableScroll = () => handleScroll(tableContainer, topScroll);
    const onTopScroll = () => handleScroll(topScroll, tableContainer);

    tableContainer.addEventListener('scroll', onTableScroll, { passive: true });
    topScroll.addEventListener('scroll', onTopScroll, { passive: true });

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      observer.disconnect();
      tableContainer.removeEventListener('scroll', onTableScroll);
      topScroll.removeEventListener('scroll', onTopScroll);
    };
  }, [viewMode, activeTab, currentSnapshots, snapshotType]);

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

  useEffect(() => {
    console.log("App mounted, user:", user?.email);
  }, [user]);

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
          {!user ? (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 p-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all text-sm font-bold"
            >
              <LogIn size={18} /> {isSidebarOpen ? 'Entrar com Google' : ''}
            </button>
          ) : (
            <div className={`flex items-center gap-3 p-2 rounded-xl ${isSidebarOpen ? 'bg-gray-50' : ''}`}>
              <img src={user?.photoURL || ""} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user?.displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{isAdmin ? 'Administrador' : 'Operador'}</p>
                </div>
              )}
              {isSidebarOpen && (
                <button onClick={handleLogout} className="text-gray-400 hover:text-red-500">
                  <LogOut size={18} />
                </button>
              )}
            </div>
          )}
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/50">
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-20 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-semibold text-gray-900 capitalize">{activeTab}</h2>
            {!user && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-100 rounded-full">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Modo Offline (Dev)</span>
              </div>
            )}
            {(activeTab === 'dashboard' || activeTab === 'contractors') && (
                <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                  <div className="relative flex items-center">
                    <CalendarIcon size={14} className="absolute left-2 text-gray-400 pointer-events-none" />
                    <select 
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-transparent border-none text-[11px] font-bold focus:ring-0 cursor-pointer pl-7 pr-4 py-1 appearance-none"
                    >
                      <option value="ALL">Todos os Períodos</option>
                      {Array.from(new Set(snapshots.map(s => s.referenceMonth).filter(Boolean))).sort().reverse().map(m => (
                        <option key={m as string} value={m as string}>{m as string}</option>
                      ))}
                      {!snapshots.some(s => s.referenceMonth === format(new Date(), 'yyyy-MM')) && (
                        <option value={format(new Date(), 'yyyy-MM')}>{format(new Date(), 'yyyy-MM')}</option>
                      )}
                    </select>
                  </div>
                  <div className="h-4 w-px bg-gray-300 mx-1" />
                  <select 
                    value={snapshotType}
                    onChange={(e) => setSnapshotType(e.target.value as any)}
                    className="bg-transparent border-none text-[11px] font-bold focus:ring-0 cursor-pointer"
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
          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {deleteModal.show && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8"
                >
                  <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
                    <AlertTriangle className="text-red-600 w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {deleteModal.type === 'ALL' ? 'Excluir TUDO' : 'Confirmar Exclusão'}
                  </h3>
                    <p className="text-gray-500 mb-6">
                      {deleteModal.type === 'ALL' ? (
                        <>Você está prestes a excluir <strong>TODOS os {snapshots.length} registros</strong> importados de todo o histórico do sistema.</>
                      ) : (
                        <>Você está prestes a excluir <strong>{currentSnapshots.length}</strong> registros de <strong>{deleteModal.type === 'COMPANY_DOCS' ? 'Empresas' : 'Colaboradores'}</strong> do mês <strong>{selectedMonth}</strong>.</>
                      )}
                      <br /><br />
                      <span className="text-gray-600 block mb-2">Nota: A <strong>Agenda</strong> e seus compromissos <strong>não</strong> serão afetados por esta ação.</span>
                      <span className="text-red-600 font-bold">Esta ação é irreversível para os dados importados.</span>
                    </p>
                  <div className="flex flex-col gap-3">
                    <Button 
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg" 
                      onClick={() => handleDeleteSnapshots(deleteModal.type === 'ALL')}
                    >
                      Sim, Excluir Definitivamente
                    </Button>
                    <Button 
                      variant="secondary" 
                      className="w-full" 
                      onClick={() => setDeleteModal({ show: false, type: '' })}
                    >
                      Cancelar
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

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

          {/* Details Modal */}
          <AnimatePresence>
            {selectedSnapshot && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                >
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center">
                        {selectedSnapshot.type === 'COMPANY_DOCS' ? <Users size={24} /> : <User size={24} />}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{selectedSnapshot.contractorName}</h3>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">{selectedSnapshot.type === 'COMPANY_DOCS' ? 'Empresa' : 'Colaborador'}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedSnapshot(null)}
                      className="p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Status Atual</label>
                        <div><Badge status={selectedSnapshot.status as any} /></div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Obra / Local</label>
                        <p className="text-sm font-bold text-gray-900">{selectedSnapshot.worksite}</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{selectedSnapshot.type === 'COMPANY_DOCS' ? 'CNPJ' : 'CPF/ID'}</label>
                        <p className="text-sm font-bold text-gray-900 font-mono">{selectedSnapshot.cnpj || 'Não informado'}</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Mês de Referência</label>
                        <p className="text-sm font-bold text-gray-900">{selectedSnapshot.referenceMonth}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest border-b border-gray-100 pb-2">Todos os Dados Importados</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {(selectedSnapshot.columnOrder || Object.keys(selectedSnapshot.rawData || {})).map(key => (
                          <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group hover:border-blue-200 transition-all">
                            <span className="text-xs font-bold text-gray-500 uppercase">{key.replace(/_/g, ' ')}</span>
                            <span className="text-sm font-black text-gray-900 text-right">{String(selectedSnapshot.rawData[key] || '---')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                    <Button className="flex-1" onClick={() => setSelectedSnapshot(null)}>Fechar Detalhes</Button>
                    <Button variant="secondary" className="flex-1"><Download size={18} /> Exportar Ficha</Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {(isImporting || isDeleting) && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <Card className={`p-6 border-2 ${importProgress.error ? 'border-red-200 bg-red-50' : isDeleting ? 'border-orange-100 bg-orange-50/30' : 'border-blue-100 bg-blue-50/30'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${importProgress.error ? 'bg-red-600' : isDeleting ? 'bg-orange-600 animate-pulse' : 'bg-blue-600 animate-pulse'}`}>
                      {importProgress.error ? <AlertTriangle size={20} /> : isDeleting ? <X size={20} /> : <Plus size={20} />}
                    </div>
                    <div>
                      <h3 className={`font-bold ${importProgress.error ? 'text-red-900' : isDeleting ? 'text-orange-900' : 'text-blue-900'}`}>
                        {importProgress.error ? 'Falha na Operação' : (importProgress.status || (isDeleting ? "Excluindo Dados..." : "Processando Planilha..."))}
                      </h3>
                      <p className={`text-sm ${importProgress.error ? 'text-red-600' : isDeleting ? 'text-orange-600' : 'text-blue-600'}`}>
                        {importProgress.error ? importProgress.error : isDeleting ? 'Removendo registros selecionados do banco de dados.' : 'Enviando dados para o sistema de forma segura.'}
                      </p>
                    </div>
                  </div>
                  {!importProgress.error && (
                    <div className="text-right">
                      <span className={`text-2xl font-black ${isDeleting ? 'text-orange-900' : 'text-blue-900'}`}>
                        {importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%
                      </span>
                      <p className={`text-xs font-medium uppercase tracking-wider ${isDeleting ? 'text-orange-500' : 'text-blue-500'}`}>
                        {importProgress.current} de {importProgress.total} registros
                      </p>
                    </div>
                  )}
                  {importProgress.error ? (
                    <div className="flex flex-col gap-2">
                      <Button 
                        variant="secondary" 
                        className="bg-white border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setIsImporting(false);
                          setIsDeleting(false);
                          setImportProgress({ current: 0, total: 0, status: '', error: null });
                        }}
                      >
                        Fechar e Tentar Novamente
                      </Button>
                      <button 
                        onClick={() => {
                          localStorage.clear();
                          window.location.reload();
                        }}
                        className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                      >
                        Limpar Cache e Recarregar Sistema
                      </button>
                      <button 
                        onClick={() => {
                          setIsImporting(false);
                          setImportProgress({ current: 0, total: 0, status: '', error: null });
                          window.location.reload();
                        }}
                        className="text-[10px] text-red-400 hover:text-red-600 font-bold uppercase tracking-tighter"
                      >
                        Forçar Reinício (Se estiver travado)
                      </button>
                      {!navigator.onLine && (
                        <p className="text-[10px] text-red-500 text-center font-bold animate-pulse">
                          ⚠️ VOCÊ ESTÁ OFFLINE
                        </p>
                      )}
                    </div>
                  ) : (
                    <Button 
                      variant="ghost" 
                      className="text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        if (window.confirm("Deseja realmente cancelar a operação atual? Isso pode deixar os dados incompletos.")) {
                          setIsImporting(false);
                          setIsDeleting(false);
                          setImportProgress({ current: 0, total: 0, status: '', error: null });
                          window.location.reload();
                        }
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
                {!importProgress.error && (
                  <div className={`h-3 rounded-full overflow-hidden ${isDeleting ? 'bg-orange-100' : 'bg-blue-100'}`}>
                    <motion.div 
                      className={`h-full ${isDeleting ? 'bg-orange-600' : 'bg-blue-600'}`}
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
                <div className="flex flex-col gap-6 mb-8">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                        <LayoutDashboard size={20} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Análise Dinâmica de Dados</h3>
                        <p className="text-xs text-gray-500 font-medium">Personalize seus indicadores e filtros em tempo real</p>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto justify-end items-center">
                      <div className={`hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${navigator.onLine ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${navigator.onLine ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        {navigator.onLine ? 'ONLINE' : 'OFFLINE'}
                      </div>
                      <Button variant="secondary" onClick={() => window.location.reload()}>
                        <Clock size={16} className="mr-2" /> Sincronizar Agora
                      </Button>
                      {isAdmin && (
                        <Button 
                          variant="secondary" 
                          className="bg-red-50 border-red-100 text-red-600 hover:bg-red-100"
                          onClick={() => setDeleteModal({ show: true, type: 'ALL' })}
                          disabled={isDeleting || snapshots.length === 0}
                        >
                          <X size={16} className="mr-2" /> Limpar Dados
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dynamic Analytics is now the primary and only section */}
                <div className="mb-12">
                  <DynamicAnalytics data={currentSnapshots} type={snapshotType} />
                </div>
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
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                      <button 
                        onClick={() => setViewMode('table')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center ${viewMode === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        <List size={14} className="mr-1.5" /> Tabela
                      </button>
                      <button 
                        onClick={() => setViewMode('cards')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center ${viewMode === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        <Grid size={14} className="mr-1.5" /> Cards
                      </button>
                    </div>
                    <Button variant="secondary"><Filter size={18} /> Filtros</Button>
                    {(isEditor || !user) && (
                      <div className="flex gap-2">
                          <Button 
                            variant="secondary" 
                            className="bg-red-50 border-red-100 text-red-600 hover:bg-red-100"
                            onClick={() => setDeleteModal({ show: true, type: snapshotType })}
                            disabled={isDeleting || currentSnapshots.length === 0}
                          >
                            <X size={18} /> Limpar Dados do Mês
                          </Button>
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

                {viewMode === 'cards' ? (
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
                          <button 
                            onClick={() => setSelectedSnapshot(s)}
                            className="text-gray-900 font-semibold text-sm flex items-center gap-1 hover:text-blue-600 transition-colors"
                          >
                            Ver Dados <ChevronRight size={16} />
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="overflow-hidden flex flex-col">
                    {/* Top Scrollbar - Ultra-Visible Sync Bar */}
                    <div 
                      ref={topScrollRef}
                      className="overflow-x-auto overflow-y-hidden bg-blue-50 border-b border-blue-100 top-scrollbar"
                      style={{ 
                        height: isOverflowing ? '14px' : '0px',
                        opacity: isOverflowing ? 1 : 0,
                        display: isOverflowing ? 'block' : 'none'
                      }}
                    >
                      <div style={{ width: tableWidth || '100%', height: '1px' }} />
                    </div>

                    <div ref={tableContainerRef} className="overflow-x-auto custom-scrollbar bg-white">
                      <table className="w-full text-left border-collapse min-w-max">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">Status</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-[100px] bg-gray-50 z-10">
                              {snapshotType === 'COMPANY_DOCS' ? 'Nome/Empresa' : 'Nome/Colaborador'}
                            </th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Obra/Local</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Mês Ref.</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                              {snapshotType === 'COMPANY_DOCS' ? 'CNPJ' : 'CPF/ID'}
                            </th>
                            {currentSnapshots.length > 0 && (currentSnapshots[0].columnOrder || Object.keys(currentSnapshots[0].rawData || {})).map(key => (
                              <th key={key} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {currentSnapshots.map((s) => {
                            const columns = s.columnOrder || Object.keys(s.rawData || {});
                            return (
                              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
                                  <Badge status={s.status as any} />
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900 sticky left-[100px] bg-white group-hover:bg-gray-50 z-10">{s.contractorName}</td>
                                <td className="px-6 py-4 text-gray-500 text-sm">{s.worksite}</td>
                                <td className="px-6 py-4 text-gray-500 text-sm">{s.referenceMonth}</td>
                                <td className="px-6 py-4 text-gray-500 text-sm font-mono">{s.cnpj || '---'}</td>
                                {columns.map((key, i) => (
                                  <td key={i} className="px-6 py-4 text-gray-400 text-xs truncate max-w-[200px]">{String(s.rawData[key] || '')}</td>
                                ))}
                                <td className="px-6 py-4 text-right sticky right-0 bg-white group-hover:bg-gray-50 z-10">
                                  <button 
                                    onClick={() => setSelectedSnapshot(s)}
                                    className="p-2 hover:bg-gray-200 rounded-lg text-blue-600 font-bold text-xs flex items-center gap-1"
                                  >
                                    DETALHES <ChevronRight size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {currentSnapshots.length === 0 && (
                            <tr>
                              <td colSpan={20} className="px-6 py-12 text-center text-gray-400">
                                Nenhum registro encontrado para este filtro.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
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
