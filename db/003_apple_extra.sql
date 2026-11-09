-- 003: ore in piedi (anello "Alzati" di Fitness)
insert into sport.metric_catalog(metric, label_it, unit, kind, source_priority) values
 ('stand_h','Ore con almeno un minuto in piedi','h','misura','{apple_health}')
on conflict (metric) do nothing;
