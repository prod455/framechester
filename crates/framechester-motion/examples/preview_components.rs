//! Renders one PNG per component and format at a settled time, for visual review.
use framechester_core::domain::Scene;
use framechester_core::narration::{assemble_scene, segment_narration, SegmentAudio};
use framechester_core::planner::plan_scene;
use framechester_core::storyboard::VideoFormat;
use framechester_motion::compose::compose_scene;
use framechester_motion::format::Canvas;
use framechester_motion::raster::Rasterizer;
use framechester_motion::text::Typesetter;
fn main() {
    let out = std::path::PathBuf::from(std::env::args().nth(1).expect("output dir"));
    let briefs = [
        ("pergunta", "#pergunta Skill ou agente: qual a diferença na prática?", "Skill ou agente: qual a diferenca na pratica? Vamos ver."),
        ("fluxo", "#fluxo Objetivo [user] -> Decidir [brain] {primary} -> Agir [tool] -> Observar [search] -> loop", "O agente recebe o objetivo, decide o proximo passo, age com uma ferramenta e observa o resultado. Depois repete."),
        ("comparacao", "#comparacao Agente: decide o passo; executa ferramentas; observa | Skill: ensina o processo; versionada; reutilizavel", "O agente decide e executa. A skill ensina o processo e e reutilizavel."),
        ("timeline", "#linha-do-tempo 2022: prompts soltos; 2024: agentes com ferramentas; 2025: skills empacotadas", "Em 2022 eram prompts soltos. Em 2024 vieram agentes com ferramentas. Em 2025, skills empacotadas."),
        ("grafico", "#grafico Tokens no contexto | Sem skill=100%; Com skill=40%", "Sem skill, 100% das instrucoes entram no contexto. Com skill, cerca de 40%."),
        ("arquitetura", "#arquitetura Agente/Planejador; Agente/Executor; Skills/SKILL.md; Skills/scripts; Planejador -> SKILL.md; Executor -> scripts", "O planejador le o SKILL.md e o executor roda os scripts."),
        ("codigo", "#codigo markdown | SKILL.md\n---\nname: revisar-pr\ndescription: Revisa PRs\n---\n1. Leia o diff\n2. Rode os testes", "O arquivo tem nome, descricao e os passos."),
        ("transformacao", "#transformacao Prompt gigante; Regras soltas => Skill versionada [skill]", "Um prompt gigante e regras soltas viram uma skill versionada."),
        ("anotacao", "#anotacao revisar-pr/SKILL.md: instrucoes e metadados; revisar-pr/scripts/check.py: codigo opcional; revisar-pr/exemplos: casos reais", "A pasta tem o SKILL.md com instrucoes, scripts opcionais e exemplos."),
        ("infografico", "#infografico O que muda | Tokens=40%: do contexto [chart]; Passos=3: etapas fixas [check]; Erros [shield]: menos retrabalho", "Caem para 40% os tokens, sao 3 passos fixos e menos erros."),
        ("causa", "#causa Sem skill => O agente improvisa => Resultados variam => Mais retrabalho", "Sem skill, o agente improvisa, os resultados variam e ha mais retrabalho."),
        ("personagem-apresentador", "#personagem apresentador | explicar | Uma skill é uma receita que o agente segue", "Uma skill e uma receita. O agente segue os passos dela."),
        ("personagem-dev", "#personagem dev | apontar | O SKILL.md fica na pasta do projeto", "O arquivo fica na pasta do projeto, versionado com o codigo."),
        ("personagem-cientista", "#personagem cientista | pensar | Dá para medir a diferença?", "Da para medir a diferenca? Vamos testar duas vezes."),
        ("personagem-robo", "#personagem robo | comemorar | Mesma tarefa, metade dos tokens", "Mesma tarefa, com menos tokens no contexto."),
    ];
    let typesetter = Typesetter::new().unwrap();
    for (name, title, character) in [
        (
            "robo",
            "Skills vs. Agentes de IA: a diferença na prática",
            framechester_core::storyboard::Character::Robot,
        ),
        (
            "cientista",
            "Dá para medir a diferença?",
            framechester_core::storyboard::Character::Scientist,
        ),
    ] {
        let issues = framechester_motion::thumbnail::render(
            &typesetter,
            title,
            character,
            &out.join(format!("thumbnail-{name}.png")),
        )
        .unwrap();
        if !issues.is_empty() {
            println!("thumbnail {name}: {issues:?}");
        }
    }
    for format in [
        VideoFormat::Vertical,
        VideoFormat::Horizontal,
        VideoFormat::X,
    ] {
        let canvas = Canvas::for_format(format);
        let rasterizer = Rasterizer::new(&typesetter, canvas.width, canvas.height);
        for (name, brief, narration) in briefs {
            let mut scene = plan_scene(
                &Scene {
                    id: 1,
                    heading: "Conceito da cena em uma frase".into(),
                    narration: narration.into(),
                    visual_brief: brief.into(),
                    duration_hint_secs: 5.0,
                },
                1,
            )
            .unwrap();
            let texts = segment_narration(narration);
            let audio: Vec<SegmentAudio> = texts
                .iter()
                .map(|t| SegmentAudio {
                    duration_secs: t.split_whitespace().count() as f32 * 0.33,
                    leading_silence_secs: 0.05,
                    trailing_silence_secs: 0.1,
                })
                .collect();
            let (segments, duration) = assemble_scene(&texts, &audio, &vec![false; texts.len()]);
            scene.segments = segments;
            scene.duration_secs = duration;
            let composed = compose_scene(&typesetter, &canvas, &scene, 1, 6);
            let t = duration * 0.7;
            let svg = composed.graph.svg(t, canvas.width, canvas.height, "Inter");
            rasterizer
                .save_png(&svg, &out.join(format!("{}-{name}.png", format.slug())))
                .unwrap();
            if !composed.issues.is_empty() {
                println!("{format:?} {name}: {:?}", composed.issues);
            }
        }
    }
}
