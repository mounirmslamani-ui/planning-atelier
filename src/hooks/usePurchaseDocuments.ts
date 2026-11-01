import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb: any = supabase;
const BUCKET = 'purchase-documents';

export interface PurchaseFile {
  id: string;
  filePath: string;
  fileName: string;
  fileType: string | null;
}

const sanitize = (name: string) =>
  name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-120);

/** Fichiers joints à un achat (facture / BL). */
export function usePurchaseFiles(purchaseId?: string | null) {
  return useQuery({
    queryKey: ['purchase-files', purchaseId],
    enabled: !!purchaseId,
    staleTime: 0,
    queryFn: async (): Promise<PurchaseFile[]> => {
      const { data, error } = await sb
        .from('material_purchase_attachments')
        .select('id, file_path, file_name, file_type')
        .eq('purchase_id', purchaseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        filePath: r.file_path,
        fileName: r.file_name,
        fileType: r.file_type,
      }));
    },
  });
}

/** Envoie des fichiers dans le bucket puis les enregistre ; renvoie le nombre réussi et les noms en échec. */
export function useUploadPurchaseFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { purchaseId: string; files: File[] }): Promise<{ ok: number; failed: string[] }> => {
      let ok = 0;
      const failed: string[] = [];
      for (const file of v.files) {
        const path = `${v.purchaseId}/${crypto.randomUUID()}-${sanitize(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) { failed.push(file.name); continue; }
        const { error: insErr } = await sb.from('material_purchase_attachments').insert({
          purchase_id: v.purchaseId,
          file_path: path,
          file_name: file.name,
          file_type: file.type || null,
          file_size: file.size,
        });
        if (insErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          failed.push(file.name);
          continue;
        }
        ok++;
      }
      return { ok, failed };
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ['purchase-files', v.purchaseId] }),
  });
}

/** Ouvre le fichier dans un nouvel onglet (URL signée de 2 minutes) ou le télécharge. */
export async function openPurchaseFile(file: PurchaseFile, download = false): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.filePath, 120, download ? { download: file.fileName } : undefined);
  if (error || !data?.signedUrl) return false;
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  return true;
}
