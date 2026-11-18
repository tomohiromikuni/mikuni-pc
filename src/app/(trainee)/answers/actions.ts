'use server';
import { revalidatePath } from 'next/cache';
import { requireTrainee } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function submitAnswer(surveyId: string, answers: { question_id: string; option_ids: string[]; text: string }[]): Promise<{ error?: string }> {
  await requireTrainee();
  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_survey_response', { p_survey: surveyId, p_answers: answers });
  if (error) return { error: error.message };
  revalidatePath('/answers');
  revalidatePath('/home');
  return {};
}
