import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

const sampleContractors = [
  { name: "Construções Alpha", status: "APTO", worksite: "Obra Residencial Sul", cnpj: "12.345.678/0001-01", criticalIssues: 0 },
  { name: "Engenharia Beta", status: "BLOQUEADO", worksite: "Edifício Central", cnpj: "23.456.789/0001-02", criticalIssues: 5 },
  { name: "Gama Reformas", status: "PENDENTE", worksite: "Obra Residencial Sul", cnpj: "34.567.890/0001-03", criticalIssues: 2 },
  { name: "Delta Infra", status: "APTO", worksite: "Ponte Norte", cnpj: "45.678.901/0001-04", criticalIssues: 0 },
  { name: "Epsilon Elétrica", status: "BLOQUEADO", worksite: "Ponte Norte", cnpj: "56.789.012/0001-05", criticalIssues: 3 }
];

const sampleAppointments = [
  { title: "Vistoria Técnica Alpha", date: new Date().toISOString(), type: "VISITA", worksite: "Obra Residencial Sul", status: "PLANEJADO", createdBy: "system" },
  { title: "Reunião de Regularização Beta", date: new Date(Date.now() + 86400000).toISOString(), type: "REGULARIZACAO", worksite: "Edifício Central", status: "PLANEJADO", createdBy: "system" },
  { title: "Auditoria de Segurança Gama", date: new Date(Date.now() + 172800000).toISOString(), type: "AUDITORIA", worksite: "Obra Residencial Sul", status: "PLANEJADO", createdBy: "system" }
];

export async function seedDatabase() {
  try {
    for (const c of sampleContractors) {
      await addDoc(collection(db, 'contractors'), c);
    }
    for (const a of sampleAppointments) {
      await addDoc(collection(db, 'appointments'), a);
    }
    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}
