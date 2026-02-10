export interface JudgmentData {
  id: number;
  apelacja: string;
  typ_sadu: string;
  instancja_sadu: string;
  podstawa_prawna: string;
  podstawa_prawna_podana: boolean;
  rodzaj_roszczenia: string;
  modyfikacje: boolean;
  wynik_sprawy?: string;
  data_wyroku?: string;
}
