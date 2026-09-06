export interface CommercialDateInputs {
  sourceConfirmedAt?: Date | null;
  sourceCreatedAt?: Date | null;
}

export function computeCommercialDate(inputs: CommercialDateInputs): Date | null {
  return inputs.sourceConfirmedAt ?? inputs.sourceCreatedAt ?? null;
}
