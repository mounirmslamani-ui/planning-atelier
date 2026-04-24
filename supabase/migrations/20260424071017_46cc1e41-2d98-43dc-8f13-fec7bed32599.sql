-- Ajouter la valeur 'undetermined' à l'enum order_priority
ALTER TYPE order_priority ADD VALUE IF NOT EXISTS 'undetermined';