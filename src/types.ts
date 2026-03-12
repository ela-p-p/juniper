export type PaymentFrequency =
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL";

export type Primitive = string | number | boolean;

export type RuleOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "exists";

export type RuleCommand =
  | RuleOperator
  | "equals"
  | "equal"
  | "not equals"
  | "not_equal"
  | "not_equals"
  | "greater than"
  | "greater_than"
  | "greater than or equal"
  | "greater_than_or_equal"
  | "less than"
  | "less_than"
  | "less than or equal"
  | "less_than_or_equal"
  | "one of"
  | "in list"
  | (string & {});

export interface GenericRuleExpression {
  command: RuleCommand;
  value?: unknown;
}

export interface FactReference {
  fact: string;
}

export type GenericRuleCondition = Record<string, GenericRuleExpression>;

export interface FinancingRequest {
  amount: number;
  currency: string;
  policyType: string;
  paymentMethod: string;
  termMonths?: number;
  paymentFrequency?: PaymentFrequency;
  [key: string]: unknown;
}

export interface FieldConfig {
  type: "string" | "number" | "boolean";
  required?: boolean;
  enum?: Primitive[];
  min?: number;
  max?: number;
  description?: string;
}

export type Condition = GenericRuleCondition;

export interface DecisionError {
  code: string;
  message: string;
  field?: string;
  actualValue?: unknown;
  expectedCondition?: string;
}

export interface BusinessRule {
  id: string;
  description: string;
  condition: Condition;
  error: DecisionError;
}

export interface PartnerConfig {
  partnerId: string;
  name: string;
  defaults: {
    termMonths: number;
    paymentFrequency: PaymentFrequency;
  };
  rules: BusinessRule[];
}

export interface InstallmentEntry {
  dueNumber: number;
  dueAmount: number;
  dueEveryMonths: number;
}

export interface FinancingDecisionResponse {
  decisionId: string;
  partnerId: string;
  financeable: boolean;
  summary?: {
    amountFinanced: number;
    currency: string;
    termMonths: number;
    paymentFrequency: PaymentFrequency;
    installmentCount: number;
    installmentAmount: number;
  };
  installments?: InstallmentEntry[];
  errors: DecisionError[];
  timingMs: {
    total: number;
    ruleEvaluation: number;
    installmentCalculation: number;
  };
}
