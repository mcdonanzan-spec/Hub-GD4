import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { get, set, del } from 'idb-keyval';
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
  Download,
  Loader2
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
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [snapshotType, setSnapshotType] = useState<'COMPANY_DOCS' | 'EMPLOYEE_DOCS'>('COMPANY_DOCS');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [prompt, setPrompt] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ show: false, type: '' });
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, status: '', error: null as string | null, stats: null as any });
  const [importModal, setImportModal] = useState<{ show: boolean, type: 'COMPANY_DOCS' | 'EMPLOYEE_DOCS' | null, file: File | null }>({ show: false, type: null, file: null });
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  
  const normalizeCPF = (val: string) => {
    return String(val || "").replace(/\D/g, '').padStart(11, '0').substring(0, 11);
  };
  useEffect(() => {
    const loadCache = async () => {
      try {
        const cached = await get('gd4_snapshots_cache');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          console.log(`[Persistence] Carregados ${cached.length} registros do IndexedDB.`);
          setSnapshots(cached);
        }
      } catch (e) {
        console.error("[Persistence] Falha ao carregar cache IndexedDB:", e);
      }
    };
    loadCache();
  }, []);

  useEffect(() => {
    if (snapshots.length > 0) {
      set('gd4_snapshots_cache', snapshots).catch(e => console.error("[Persistence] Erro ao salvar no IndexedDB:", e));
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
    if (isDeleting || isImporting) return;

    let unsubSnapshots = () => {};
    let unsubAppointments = () => {};
    let unsubUsers = () => {};

    if (user) {
      const qSnapshots = query(collection(db, 'snapshots'), orderBy('importDate', 'desc'));
      unsubSnapshots = onSnapshot(qSnapshots, (snapshot) => {
        const newSnapshots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Snapshot));
        console.log(`Snapshot recebido: ${snapshot.size} registros.`);
        setSnapshots(newSnapshots);
        set('gd4_snapshots_cache', newSnapshots).catch(e => console.error("[Persistence] Erro ao atualizar cache:", e));
      }, (err) => {
        console.error("Firestore Snapshot Error:", err);
        // Don't throw if we have local data, just log
        if (snapshots.length === 0) {
          handleFirestoreError(err, OperationType.LIST, 'snapshots');
        }
      });

      const qAppointments = query(collection(db, 'appointments'), orderBy('date'));
      unsubAppointments = onSnapshot(qAppointments, (snapshot) => {
        setAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));

      if (isAdmin) {
        const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        unsubUsers = onSnapshot(qUsers, (snapshot) => {
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
    if (!file || !type || isImporting) return;

    const month = selectedMonth === 'ALL' ? format(new Date(), 'yyyy-MM') : selectedMonth;
    setImportModal({ show: false, type: null, file: null });
    setIsImporting(true);
    setImportProgress({ current: 0, total: 0, status: 'Iniciando motor de alta performance...', error: null, stats: null });
    
    try {
      let data: any[] = [];
      const isCSV = file.name.toLowerCase().endsWith('.csv');

      if (isCSV) {
        setImportProgress(prev => ({ ...prev, status: 'Lendo CSV (ISO-8859-1)...' }));
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsText(file, 'ISO-8859-1');
        });
        
        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) throw new Error("Arquivo CSV vazio ou sem dados.");

        const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim());
        data = lines.slice(1).map(line => {
          const cells = line.split(';').map(c => c.replace(/"/g, '').trim());
          const row: any = {};
          headers.forEach((h, i) => {
            row[h] = cells[i] || "";
          });
          return row;
        });
      } else {
        // Step 1: Offload Parsing to a Web Worker (Inline Blob for zero-config)
        const workerCode = `
          importScripts('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
          self.onmessage = function(e) {
            try {
              const wb = XLSX.read(e.data, { type: 'array', cellDates: true });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
              self.postMessage({ success: true, data: data });
            } catch (err) {
              self.postMessage({ success: false, error: err.message });
            }
          };
        `;
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        const arrayBuffer = await file.arrayBuffer();
        
        setImportProgress(prev => ({ ...prev, status: 'Analisando planilha em segundo plano...' }));
        
        data = await new Promise<any[]>((resolve, reject) => {
          worker.onmessage = (e) => {
            if (e.data.success) resolve(e.data.data);
            else reject(new Error(e.data.error));
            worker.terminate();
          };
          worker.postMessage(arrayBuffer, [arrayBuffer]);
        });
      }

      if (!data || data.length === 0) throw new Error("A planilha selecionada está vazia.");

      const totalRecords = data.length;
      
      // Step 2: Preparation (Optimized Key Mapping)
      const rowKeys = Object.keys(data[0] || {});
      const sanitizeKey = (key: string) => key.replace(/[\.\#\$\[\]\/]/g, '_');
      const keyMap = rowKeys.reduce((acc, k) => {
        acc[k] = sanitizeKey(k);
        return acc;
      }, {} as Record<string, string>);
      
      const sanitizedHeaders = rowKeys.map(h => keyMap[h]);
      const findK = (keys: string[]) => rowKeys.find(k => keys.includes(k.toUpperCase().trim()));
      
      // Smart Mapping from User Snippet + Existing Logic
      const nameK = findK(type === 'COMPANY_DOCS' ? ['EMPRESA', 'CONTRACTOR', 'NOME', 'RAZÃO SOCIAL', 'FORNECEDOR'] : ['COLABORADOR', 'NOME', 'FUNCIONÁRIO', 'NOME DO COLABORADOR']);
      const idK = findK(type === 'COMPANY_DOCS' ? ['CNPJ', 'IDENTIFICADOR'] : ['CPF', 'MATRÍCULA', 'IDENTIFICADOR']);
      const statusK = findK(['STATUS', 'SITUAÇÃO', 'ESTADO']);
      const worksiteK = findK(['OBRA', 'WORKSITE', 'LOCAL', 'PROJETO', 'RESPONSÁVEL']);

      // Calculate Stats
      const existingNames = new Set(snapshots.filter(s => s.type === type && s.referenceMonth === month).map(s => s.contractorName?.toLowerCase().trim()));
      let newCount = 0;
      let updatedCount = 0;

      // Step 3: High-Speed Pipelined Upload
      const BATCH_SIZE = 500; 
      const CONCURRENCY = user ? 5 : 0; // Reduced concurrency for stability, 0 if offline
      let completed = 0;
      let failedBatches = 0;

      if (user) {
        const chunks: any[][] = [];
        for (let i = 0; i < data.length; i += BATCH_SIZE) chunks.push(data.slice(i, i + BATCH_SIZE));

        setImportProgress({ 
          current: 0, 
          total: totalRecords, 
          status: `Preparado: ${chunks.length} lotes. Iniciando sincronização...`, 
          error: null, 
          stats: null 
        });

        const processChunk = async (chunk: any[]) => {
          const batch = writeBatch(db);
          chunk.forEach(row => {
            const name = String(row[nameK!] || "Sem Nome").trim();
            if (existingNames.has(name.toLowerCase())) updatedCount++;
            else newCount++;

            const compactData: any = {};
            for (const k in row) {
              const val = row[k];
              if (val !== null && val !== undefined && val !== "") {
                compactData[keyMap[k]] = val;
              }
            }
            
            const docRef = doc(collection(db, 'snapshots'));
            batch.set(docRef, {
              type, 
              referenceMonth: month, 
              importDate: new Date().toISOString(),
              rawData: compactData, 
              columnOrder: sanitizedHeaders, 
              importedBy: user?.uid || "anonymous",
              worksite: String(row[worksiteK!] || "Geral").trim(),
              contractorName: name,
              cnpj: type === 'EMPLOYEE_DOCS' ? normalizeCPF(row[idK!]) : String(row[idK!] || "").trim(),
              status: String(row[statusK!] || "PENDENTE").toUpperCase().trim(),
            });
          });

          await batch.commit();
          completed += chunk.length;
          
          setImportProgress(prev => ({ 
            ...prev, 
            current: completed, 
            status: `Sincronizando: ${completed} / ${totalRecords}` 
          }));
        };

        const queue = [...chunks];
        const runWorker = async () => {
          while (queue.length > 0) {
            const chunk = queue.shift();
            if (!chunk) break;
            try {
              await processChunk(chunk);
            } catch (e: any) {
              console.error("Batch failed:", e);
              failedBatches++;
              // Track failed records accurately
              const failedInThisBatch = chunk.length;
              setImportProgress(prev => ({ 
                ...prev, 
                status: `Aviso: Lote falhou (${failedBatches}). Continuando...` 
              }));
            }
          }
        };

        await Promise.all(Array(CONCURRENCY).fill(null).map(runWorker));

        if (failedBatches === chunks.length) {
          throw new Error("Falha total na sincronização. Verifique sua conexão ou permissões.");
        }
      } else {
        setImportProgress(prev => ({ ...prev, status: 'Modo Offline: Processando localmente...' }));
      }

      // Offline Mode Fallback (also used for local persistence)
      if (!user) {
        const localSnapshots = data.map((row, idx) => {
          const name = String(row[nameK!] || "Sem Nome").trim();
          const compactData: any = {};
          for (const k in row) {
            const val = row[k];
            if (val !== null && val !== undefined && val !== "") {
              compactData[keyMap[k]] = val;
            }
          }
          return {
            id: `local_${Date.now()}_${idx}`,
            type,
            referenceMonth: month,
            importDate: new Date().toISOString(),
            rawData: compactData,
            columnOrder: sanitizedHeaders,
            importedBy: "local",
            worksite: String(row[worksiteK!] || "Geral").trim(),
            contractorName: name,
            cnpj: type === 'EMPLOYEE_DOCS' ? normalizeCPF(row[idK!]) : String(row[idK!] || "").trim(),
            status: String(row[statusK!] || "PENDENTE").toUpperCase().trim(),
          };
        }) as Snapshot[];
        const updatedSnapshots = [...localSnapshots, ...snapshots];
        setSnapshots(updatedSnapshots);
        await set('gd4_snapshots_cache', updatedSnapshots);
      }

      const actualFailedRecords = failedBatches * BATCH_SIZE; // Approximation, but better than nothing
      
      setImportProgress({ 
        current: totalRecords, 
        total: totalRecords, 
        status: 'Sincronização Concluída!', 
        error: null,
        stats: {
          total: totalRecords,
          new: newCount,
          updated: updatedCount,
          failed: Math.min(actualFailedRecords, totalRecords)
        }
      });

    } catch (error: any) {
      console.error("Expert Import Error:", error);
      setImportProgress(prev => ({ ...prev, status: 'Erro Crítico', error: error.message }));
      setIsImporting(false);
    }
  };

  const handleDeleteSnapshots = async (all = false) => {
    if (isDeleting) return;
    setDeleteModal({ show: false, type: '' });
    setIsDeleting(true);
    
    if (all) {
      del('gd4_snapshots_cache').catch(e => console.error("[Persistence] Erro ao limpar IndexedDB:", e));
      setSnapshots([]);
    }
    
    setImportProgress({ 
      current: 0, 
      total: 100, // Placeholder until we count
      status: 'Iniciando limpeza profunda...', 
      error: null,
      stats: null
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
        setImportProgress({ current: 0, total: 0, status: 'Nenhum registro encontrado para excluir.', error: null, stats: null });
        setTimeout(() => setIsDeleting(false), 2000);
        return;
      }

      setImportProgress({ 
        current: 0, 
        total: total, 
        status: `Localizados ${total} registros. Iniciando remoção...`, 
        error: null,
        stats: null
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
        status: `Limpando base de dados... (${processed} de ${total})`,
        stats: null
      }));
        
        // Small delay to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      setImportProgress(prev => ({ ...prev, status: 'Limpeza concluída com sucesso! Sincronizando...', stats: null }));
      
      // Wait for Firestore to propagate changes
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force reload to ensure everything is fresh
      window.location.reload();
      
    } catch (error: any) {
      console.error("Erro Crítico na Limpeza:", error);
      setImportProgress(prev => ({ 
        ...prev, 
        status: 'Falha na Limpeza',
        error: "Erro: " + (error.message || "Não foi possível completar a limpeza. Tente recarregar a página."),
        stats: null
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

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  const currentSnapshots = useMemo(() => {
    return snapshots.filter(s => {
      const typeMatch = s.type === snapshotType;
      if (selectedMonth === 'ALL') {
        if (selectedMonths.length > 0) {
          return typeMatch && selectedMonths.includes(s.referenceMonth);
        }
        return typeMatch;
      }
      return typeMatch && s.referenceMonth === selectedMonth;
    });
  }, [snapshots, selectedMonth, selectedMonths, snapshotType]);

  const paginatedSnapshots = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return currentSnapshots.slice(start, start + PAGE_SIZE);
  }, [currentSnapshots, currentPage]);

  const totalPages = Math.ceil(currentSnapshots.length / PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonth, snapshotType, activeTab]);

  const tableHeaders = useMemo(() => {
    if (currentSnapshots.length === 0) return [];
    return currentSnapshots[0].columnOrder || Object.keys(currentSnapshots[0].rawData || {});
  }, [currentSnapshots]);

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
        className="bg-white border-r border-slate-100 flex flex-col sticky top-0 h-screen z-30"
      >
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-100">
                <LayoutDashboard className="text-white" size={16} />
              </div>
              <span className="font-black text-xl tracking-tighter text-slate-900">HUB GD4</span>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 mt-6">
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
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-20 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h2 className="text-xl font-black text-slate-900 tracking-tight capitalize">
                {activeTab === 'dashboard' ? 'Dashboard Analítico' : 
                 activeTab === 'contractors' ? 'Gestão de Empreiteiras' : 
                 activeTab === 'agenda' ? 'Agenda de Campo' : 'Assistente Inteligente'}
              </h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hub Central GD4</p>
            </div>
            
            <div className="h-8 w-px bg-slate-100 hidden md:block" />
            
            {!user && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Modo Offline</span>
              </div>
            )}
            {(activeTab === 'dashboard' || activeTab === 'contractors') && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                  <div className="relative flex items-center">
                    <CalendarIcon size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
                    <select 
                      value={selectedMonth}
                      onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        if (e.target.value !== 'ALL') setSelectedMonths([]);
                      }}
                      className="bg-transparent border-none text-[11px] font-black focus:ring-0 cursor-pointer pl-9 pr-4 py-1 appearance-none uppercase tracking-tighter"
                    >
                      <option value="ALL">TODOS OS PERÍODOS</option>
                      {Array.from(new Set(snapshots.map(s => s.referenceMonth).filter(Boolean))).sort().reverse().map(m => (
                        <option key={m as string} value={m as string}>{m as string}</option>
                      ))}
                    </select>
                  </div>
                  <div className="h-4 w-px bg-slate-200 mx-1" />
                  <select 
                    value={snapshotType}
                    onChange={(e) => setSnapshotType(e.target.value as any)}
                    className="bg-transparent border-none text-[11px] font-black focus:ring-0 cursor-pointer uppercase tracking-tighter"
                  >
                    <option value="COMPANY_DOCS">EMPRESAS</option>
                    <option value="EMPLOYEE_DOCS">COLABORADORES</option>
                  </select>
                </div>
                
                {selectedMonth === 'ALL' && snapshots.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center justify-end">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Filtrar Meses:</span>
                    {Array.from(new Set(snapshots.map(s => s.referenceMonth).filter(Boolean))).sort().reverse().map(m => (
                      <button
                        key={m as string}
                        onClick={() => {
                          setSelectedMonths(prev => 
                            prev.includes(m as string) 
                              ? prev.filter(x => x !== m) 
                              : [...prev, m as string]
                          );
                        }}
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black transition-all border uppercase tracking-tighter ${
                          selectedMonths.includes(m as string)
                            ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {m as string}
                      </button>
                    ))}
                    {selectedMonths.length > 0 && (
                      <button 
                        onClick={() => setSelectedMonths([])}
                        className="text-[9px] font-black text-red-500 hover:underline ml-1 uppercase tracking-widest"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-sm text-slate-500 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
              <Clock size={16} className="text-brand-600" />
              <span className="font-bold">{format(new Date(), "dd 'de' MMMM", { locale: ptBR })}</span>
            </div>
            
            <div className="h-8 w-px bg-slate-100"></div>
            
            <button className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-2xl relative transition-colors">
              <Bell size={20} />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-brand-600 rounded-full border-2 border-white"></span>
            </button>
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
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            >
              <Card className="max-w-xl w-full p-8 shadow-2xl border-none">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${isDeleting ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                      {importProgress.stats ? <CheckCircle2 size={28} /> : (isDeleting ? <AlertTriangle size={28} /> : <Loader2 size={28} className="animate-spin" />)}
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900">
                        {importProgress.stats ? 'Sincronização Concluída!' : (isDeleting ? 'Limpando Base...' : 'Importação Inteligente')}
                      </h3>
                      <p className="text-sm text-gray-500 font-medium">{importProgress.status}</p>
                    </div>
                  </div>
                  {importProgress.stats && (
                    <button 
                      onClick={() => window.location.reload()}
                      className="p-2 hover:bg-gray-100 rounded-full text-gray-400"
                    >
                      <X size={24} />
                    </button>
                  )}
                </div>

                {importProgress.error ? (
                  <div className="bg-red-50 border border-red-100 p-6 rounded-2xl mb-6">
                    <div className="flex items-center gap-3 text-red-600 mb-2">
                      <AlertTriangle size={20} />
                      <span className="font-bold">Erro na Operação</span>
                    </div>
                    <p className="text-sm text-red-500 leading-relaxed">{importProgress.error}</p>
                    <div className="mt-6 flex flex-col gap-2">
                      <button 
                        onClick={() => {
                          del('gd4_snapshots_cache');
                          window.location.reload();
                        }}
                        className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all"
                      >
                        Limpar Cache e Recarregar
                      </button>
                      <button 
                        onClick={() => {
                          setIsImporting(false);
                          setIsDeleting(false);
                          setImportProgress({ current: 0, total: 0, status: '', error: null, stats: null });
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        Fechar e Tentar Novamente
                      </button>
                    </div>
                  </div>
                ) : importProgress.stats ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                        <p className="text-3xl font-black text-gray-900">{importProgress.stats.total}</p>
                        <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mt-1">Total Processado</p>
                      </div>
                      <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                        <p className="text-3xl font-black text-blue-600">+{importProgress.stats.new}</p>
                        <p className="text-[10px] uppercase font-black text-blue-400 tracking-widest mt-1">Novos Registros</p>
                      </div>
                      <div className="bg-green-50 p-5 rounded-2xl border border-green-100">
                        <p className="text-3xl font-black text-green-600">{importProgress.stats.updated}</p>
                        <p className="text-[10px] uppercase font-black text-green-400 tracking-widest mt-1">Atualizados</p>
                      </div>
                      <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                        <p className="text-3xl font-black text-red-600">{importProgress.stats.failed}</p>
                        <p className="text-[10px] uppercase font-black text-red-400 tracking-widest mt-1">Falhas</p>
                      </div>
                    </div>
                    <Button 
                      onClick={() => window.location.reload()}
                      className="w-full py-4 text-lg shadow-xl shadow-blue-100"
                    >
                      Concluir e Ver Dashboard
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className={`h-4 rounded-full overflow-hidden ${isDeleting ? 'bg-red-100' : 'bg-blue-100'}`}>
                      <motion.div 
                        className={`h-full ${isDeleting ? 'bg-red-600' : 'bg-blue-600'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <span>{importProgress.current} de {importProgress.total} registros</span>
                      <span>{importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%</span>
                    </div>
                    <p className="text-xs text-center text-gray-400 italic">
                      {isDeleting ? 'Isso pode levar alguns segundos dependendo do tamanho da base...' : 'Cruzando dados com a base existente e identificando alterações...'}
                    </p>
                    <div className="flex justify-center">
                      <Button 
                        variant="ghost" 
                        className="text-xs text-gray-400 hover:text-gray-600"
                        onClick={() => {
                          if (window.confirm("Deseja realmente cancelar a operação atual? Isso pode deixar os dados incompletos.")) {
                            setIsImporting(false);
                            setIsDeleting(false);
                            setImportProgress({ current: 0, total: 0, status: '', error: null, stats: null });
                            window.location.reload();
                          }
                        }}
                      >
                        Cancelar Operação
                      </Button>
                    </div>
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
                      {snapshots.length === 0 && (
                        <Button 
                          variant="secondary" 
                          className="bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100"
                          onClick={async () => {
                            if (window.confirm("Deseja gerar dados de teste para visualizar o sistema?")) {
                              setIsImporting(true);
                              setImportProgress({ current: 0, total: 100, status: 'Gerando dados de teste...', error: null, stats: null });
                              try {
                                await seedDatabase();
                                setIsImporting(false);
                                window.location.reload();
                              } catch (err: any) {
                                console.error("Erro ao gerar sementes:", err);
                                setImportProgress(prev => ({ ...prev, error: err.message }));
                                setIsImporting(false);
                              }
                            }
                          }}
                        >
                          <Plus size={16} className="mr-2" /> Gerar Dados de Teste
                        </Button>
                      )}
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
                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <div className="relative w-full md:w-96">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Buscar por nome, CNPJ ou obra..." 
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/5 transition-all"
                      />
                    </div>
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
                            {tableHeaders.map(key => (
                              <th key={key} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {paginatedSnapshots.map((s) => {
                            const columns = tableHeaders;
                            return (
                              <tr key={s.id} className="hover:bg-gray-50 transition-colors group">
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

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                        <p className="text-xs text-gray-500 font-medium">
                          Mostrando <span className="text-gray-900 font-bold">{(currentPage - 1) * PAGE_SIZE + 1}</span> a <span className="text-gray-900 font-bold">{Math.min(currentPage * PAGE_SIZE, currentSnapshots.length)}</span> de <span className="text-gray-900 font-bold">{currentSnapshots.length}</span> registros
                        </p>
                        <div className="flex gap-2">
                          <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => prev - 1)}
                            className="p-2 hover:bg-white hover:shadow-sm rounded-lg border border-gray-200 disabled:opacity-30 transition-all"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <div className="flex items-center gap-1 px-3 bg-white border border-gray-200 rounded-lg text-xs font-bold">
                            {currentPage} / {totalPages}
                          </div>
                          <button 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            className="p-2 hover:bg-white hover:shadow-sm rounded-lg border border-gray-200 disabled:opacity-30 transition-all"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}
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

const NavItem = React.memo(({ icon, label, active, onClick, collapsed }: any) => {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all duration-200 ${
        active 
          ? 'bg-brand-50 text-brand-700 shadow-sm shadow-brand-50' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <div className={`${active ? 'text-brand-600' : 'text-slate-400'}`}>
        {icon}
      </div>
      {!collapsed && <span className="font-bold text-sm">{label}</span>}
    </button>
  );
});

const StatCard = React.memo(({ title, value, icon, trend, color = "gray" }: any) => {
  const colors: any = {
    gray: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600"
  };
  return (
    <Card className="p-6">
      <div className="flex justify-between items-start mb-6">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${colors[color]}`}>
          {icon}
        </div>
        {trend && (
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-widest">
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <h4 className="text-3xl font-black text-slate-900 tracking-tighter">{value}</h4>
      </div>
    </Card>
  );
});

function Calendar({ appointments }: { appointments: Appointment[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const { days, monthStart, appointmentsByDate } = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(start);
    const startDate = startOfWeek(start);
    const endDate = addDays(startOfWeek(end), 6);
    const daysInterval = eachDayOfInterval({ start: startDate, end: endDate });

    // Pre-group appointments by date for O(1) lookup during render
    const grouped: Record<string, Appointment[]> = {};
    appointments.forEach(a => {
      const dateKey = format(new Date(a.date), 'yyyy-MM-dd');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(a);
    });

    return { days: daysInterval, monthStart: start, appointmentsByDate: grouped };
  }, [currentDate, appointments]);

  return (
    <Card className="p-8">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tighter capitalize">
            {format(currentDate, "MMMM yyyy", { locale: ptBR })}
          </h3>
          <p className="text-xs font-bold text-brand-600 uppercase tracking-widest mt-1">Planejamento de Campo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2.5 hover:bg-slate-50 rounded-xl border border-slate-200 text-slate-400 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2.5 hover:bg-slate-50 rounded-xl border border-slate-200 text-slate-400 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
          <div key={day} className="bg-slate-50/50 p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {day}
          </div>
        ))}
        {days.map((day, i) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayAppointments = appointmentsByDate[dateKey] || [];
          const isCurrentMonth = day.getMonth() === monthStart.getMonth();
          return (
            <div 
              key={i} 
              className={`bg-white min-h-[140px] p-3 transition-all hover:bg-slate-50/50 group cursor-pointer ${
                !isCurrentMonth ? 'bg-slate-50/20 opacity-40' : ''
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <span className={`text-xs font-black w-8 h-8 flex items-center justify-center rounded-xl transition-all ${
                  isToday(day) 
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-100 scale-110' 
                    : 'text-slate-900 group-hover:bg-slate-100'
                }`}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-1.5">
                {dayAppointments.slice(0, 3).map(a => (
                  <div key={a.id} className="text-[9px] p-1.5 bg-slate-50 rounded-lg border-l-2 border-brand-600 truncate font-bold text-slate-700 shadow-sm">
                    {a.title}
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <div className="text-[9px] font-black text-brand-600 text-center mt-1 uppercase tracking-widest">
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
