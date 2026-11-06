# Lucky Seven: the stall's game log, one row per game (two dice each), 900 games tonight.
# Loaded before your code runs.
import numpy as np
import pandas as pd

_die1 = (
    "524546561331156524242566664361243511161224516521442154514111534442412116454"
    "354333243434415624531452153111433223334643616335452342511253113121412363132"
    "313436252243662245162125214623265362335436653521156242513564431514211321254"
    "326345343553522416162625333662261141141246331313125254133312443333361411643"
    "535661214421314315234213451341162554613212213631142156412441616435511665132"
    "314122622233424432533354612325116163644242123133441513131562144425126124241"
    "254351121242513524451521141442615335351251542422431232225142511644442412321"
    "144331245241235521544165422431632514225364563433212635541256621643111543661"
    "525411613462412525532626133212221426223121112125113353611542513313243511233"
    "111634411422212122442334325535554235444424543214225233553442351122112413432"
    "551652421425263236133344336441353341325662611133161613612324346564116124161"
    "461211653416324444546353425333635314561621332523164163216166234362124366651"
)
_die2 = (
    "323413142551154614442233621224432343521443113461114261125143452656564365331"
    "622251544225225524311452161116133323444411144322253262242641356153152442264"
    "156632252245421212521245324411566122115335422541421422212232154526533114451"
    "155234245341211611633463651444365451221263416151331246344143134132624625132"
    "162453654524622415131424641442143353264646332314263316353123312412165345434"
    "511122131324331412146645551534352321436653162226523311423611445433424231223"
    "153522624212436245353314416551362311423322113321642454332315144233116611112"
    "131624434641323231323112562415245342621233261464655531554465422253451136343"
    "441413213333433235335632416334132223442416625143424534162441241411114144663"
    "451263115414412326341434252252465335432234413424123635111225464361461544641"
    "425131144135533312144445432213333346262144512113313664224334113613165434335"
    "612436233212411121334462642144345315332322166131533514356463612433414214143"
)
games = pd.DataFrame({"die1": [int(c) for c in _die1], "die2": [int(c) for c in _die2]})


def _dice_check(p_theory, wins, p_value, threshold, rigged):
    '''Lucky Seven's check: the theoretical chance, the wins, how unlikely they are, and the verdict.'''
    from numbers import Real
    problems = []
    if not isinstance(p_theory, Real) or abs(p_theory - 8 / 36) > 0.0005:
        if isinstance(p_theory, Real) and abs(p_theory - 6 / 36) < 0.0005:
            problems.append("p_theory only counts one of the winning sums. The sign says which win. / p_theory zählt nur eine der Gewinnsummen. Das Schild sagt, welche gewinnen.")
        else:
            problems.append("p_theory is off: winning outcomes (see the sign) divided by all 36 outcomes. / p_theory stimmt nicht: Gewinn-Ergebnisse (siehe Schild) geteilt durch alle 36 Ergebnisse.")
    if not isinstance(wins, Real) or wins != 163:
        problems.append("wins is off: count the games whose two dice add up to a winning sum (see the sign). / wins stimmt nicht: Zählt die Spiele, deren zwei Würfel zusammen eine Gewinnsumme ergeben (siehe Schild).")
    if not isinstance(p_value, Real) or abs(p_value - 0.00140) > 0.0002:
        problems.append("p_value is off: the probability of at most that many wins in 900 games with fair dice (binomial). / p_value stimmt nicht: die Wahrscheinlichkeit für höchstens so viele Gewinne in 900 Spielen mit fairen Würfeln (binomial).")
    if not isinstance(threshold, Real) or abs(threshold - 0.01) > 1e-9:
        if isinstance(threshold, Real) and threshold in (1, 100):
            problems.append("threshold should be a probability between 0 and 1. / threshold soll eine Wahrscheinlichkeit zwischen 0 und 1 sein.")
        else:
            problems.append("threshold is off: the probability below which the inspection handbook calls a game suspicious. / threshold stimmt nicht: die Wahrscheinlichkeit, unter der das Prüfhandbuch ein Spiel verdächtig nennt.")
    if not isinstance(rigged, (bool, np.bool_)):
        problems.append("rigged should be True or False: compare p_value with the threshold. / rigged soll True oder False sein: Vergleicht p_value mit dem Schwellenwert.")
    elif not rigged:
        problems.append("rigged is off: is p_value below the handbook's threshold? / rigged stimmt nicht: Liegt p_value unter dem Schwellenwert des Handbuchs?")
    for p in problems:
        print(p)
    return "sealed" if not problems else "rejected"
