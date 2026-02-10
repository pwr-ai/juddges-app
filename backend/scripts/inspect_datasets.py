from datasets import load_dataset_builder

pl_ds_builder = load_dataset_builder("madmax86/saos-pl-judgments")
print(f"PL Features: {pl_ds_builder.info.features}")

en_ds_builder = load_dataset_builder("JuDDGES/en-appealcourt")
print(f"EN Features: {en_ds_builder.info.features}")
