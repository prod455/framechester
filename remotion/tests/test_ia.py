import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "ia"))
import comum  # noqa: E402


class TestComum(unittest.TestCase):
    def test_exemplo_tem_personagens_e_narracao(self):
        anuncio = comum.ler_anuncio(comum.RAIZ)
        self.assertEqual(len(comum.personagens(anuncio)), 3)
        self.assertTrue(comum.narracao(anuncio).startswith("Imagine"))

    def test_semente_fixa_por_prompt(self):
        a = comum.prompt_completo("a piggy bank character")
        self.assertEqual(comum.semente(a), comum.semente(a))
        self.assertNotEqual(comum.semente(a), comum.semente(comum.prompt_completo("a wallet")))
        self.assertLess(comum.semente(a), 2**32)

    def test_prompt_pede_fundo_liso_para_o_recorte(self):
        self.assertIn("plain flat light gray background", comum.prompt_completo("x"))
        self.assertTrue(comum.prompt_completo(" x ").endswith("SUBJECT: x"))

    def test_licenca_so_confere_exata(self):
        self.assertTrue(comum.licenca_confere("Apache-2.0", "apache-2.0"))
        self.assertFalse(comum.licenca_confere("other", "apache-2.0"))
        self.assertFalse(comum.licenca_confere(None, "mit"))
        self.assertFalse(comum.licenca_confere(["mit"], "mit"))

    def test_trechos_cobrem_o_audio_e_descartam_sobra_curta(self):
        partes = comum.trechos(20 * 16000 + 8000, 16000)
        self.assertEqual(partes[0], (0, 96000))
        self.assertEqual(len(partes), 4)  # 6 + 6 + 6 + 2,5 s: a sobra passa do mínimo de 2 s
        self.assertEqual(comum.trechos(20 * 16000 + 8000, 16000, minimo=3.0)[-1][1], 288000)
        with self.assertRaises(ValueError):
            comum.trechos(16000, 16000)
        with self.assertRaises(ValueError):
            comum.trechos(0, 16000)

    def test_caixa_quadrada_com_margem(self):
        x0, y0, x1, y1 = comum.caixa_com_margem((100, 200, 300, 600))
        self.assertEqual(x1 - x0, y1 - y0)
        self.assertGreater(x1 - x0, 400)
        self.assertAlmostEqual((x0 + x1) / 2, 200, delta=1)
        self.assertAlmostEqual((y0 + y1) / 2, 400, delta=1)


if __name__ == "__main__":
    unittest.main()
