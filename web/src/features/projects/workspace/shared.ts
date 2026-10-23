import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';

/** Mutation that refreshes the project workspace and shows the server's message on failure. */
export function useProjectMutation<TVars, TResult = unknown>(projectId: string, fn: (v: TVars) => Promise<TResult>, success?: string | ((r: TResult, v: TVars) => string | null)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      const msg = typeof success === 'function' ? success(r, v) : success;
      if (msg) toast.success(msg);
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
