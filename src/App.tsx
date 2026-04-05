import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PlanningProvider } from "@/context/PlanningContext";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import OperatorsPage from "./pages/OperatorsPage";
import OperationsPage from "./pages/OperationsPage";
import ClientsPage from "./pages/ClientsPage";
import SubcontractorsPage from "./pages/SubcontractorsPage";
import OrdersPage from "./pages/OrdersPage";
import StepsPage from "./pages/StepsPage";
import HolidaysPage from "./pages/HolidaysPage";
import ProductionRegisterPage from "./pages/ProductionRegisterPage";
import QualityControlPage from "./pages/QualityControlPage";
import DeliveryPage from "./pages/DeliveryPage";
import MaterialPurchasesPage from "./pages/MaterialPurchasesPage";
import ToolingPurchasesPage from "./pages/ToolingPurchasesPage";
import StudyPage from "./pages/StudyPage";
import EquipmentPage from "./pages/EquipmentPage";
import SubcontractingPage from "./pages/SubcontractingPage";
import AbsencesPage from "./pages/AbsencesPage";
import PlanningTableauPage from "./pages/PlanningTableauPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PlanningProvider>
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/operators" element={<OperatorsPage />} />
              <Route path="/operations" element={<OperationsPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/subcontractors" element={<SubcontractorsPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/steps" element={<StepsPage />} />
              <Route path="/holidays" element={<HolidaysPage />} />
              <Route path="/production-register" element={<ProductionRegisterPage />} />
              <Route path="/quality-control" element={<QualityControlPage />} />
              <Route path="/delivery" element={<DeliveryPage />} />
              <Route path="/material-purchases" element={<MaterialPurchasesPage />} />
              <Route path="/tooling-purchases" element={<ToolingPurchasesPage />} />
              <Route path="/study" element={<StudyPage />} />
              <Route path="/equipment" element={<EquipmentPage />} />
              <Route path="/subcontracting" element={<SubcontractingPage />} />
              <Route path="/absences" element={<AbsencesPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </PlanningProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
