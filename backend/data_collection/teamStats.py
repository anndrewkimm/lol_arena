import pandas as pd
import numpy as np
import io

def combine_team_stats(csv_content):
    """
    Combines individual player data into team-level statistics for Arena games.
    
    Args:
        csv_content (str): The content of the CSV file as a string.
        
    Returns:
        pd.DataFrame: A new DataFrame with one row per team per match.
    """
    print("Combining team stats...")

    try:
        # Use a string buffer to read the content as if it were a file
        data = pd.read_csv(io.StringIO(csv_content))
    except Exception as e:
        print(f"An error occurred while reading the CSV content: {e}")
        return None

    # Group the data by matchId and placement. Players with the same placement are on the same team.
    grouped_by_team = data.groupby(['matchId', 'placement'])

    # Initialize a list to hold the new team-level data
    team_data_list = []

    # Iterate through each unique match and placement combination
    for (matchId, placement), group in grouped_by_team:
        # Ensure there are two players in the team
        if len(group) == 2:
            player1 = group.iloc[0]
            player2 = group.iloc[1]
            
            # Print a message to show which team is being created
            print(f"Forming team with placement {placement}: {player1['championName']} and {player2['championName']}")

            # Aggregate stats for the team
            combined_stats = {
                'matchId': matchId,
                'gameDurationMinutes': player1['gameDurationMinutes'],
                'placement': placement,
                'team_kills': group['kills'].sum(),
                'team_deaths': group['deaths'].sum(),
                'team_assists': group['assists'].sum(),
                'team_totalDamageDealtToChampions': group['totalDamageDealtToChampions'].sum(),
                'team_goldEarned': group['goldEarned'].sum(),
                
                # Combine champion names to create a team composition feature
                'team_champion_pair': f"{player1['championName']}-{player2['championName']}",
                
                # This is a bit more advanced but captures the combination of augments
                # We sort the augments to ensure that 'Augment1-Augment2' is the same as 'Augment2-Augment1'
                'team_augments': '-'.join(sorted(
                    [
                        str(player1['augment1']), 
                        str(player1['augment2']), 
                        str(player2['augment1']), 
                        str(player2['augment2'])
                    ]
                ))
            }
            team_data_list.append(combined_stats)
        else:
            print(f"Warning: Skipping team in match {matchId} with placement {placement} as it does not have two players. Found {len(group)} players.")
    
    # Create the new DataFrame
    team_data = pd.DataFrame(team_data_list)
    
    output_file_path = 'TeamArenaData.csv'
    team_data.to_csv(output_file_path, index=False)
    print(f"Successfully created a new CSV file: {output_file_path}")
    print("New DataFrame head:")
    print(team_data.head())
    
    return team_data

# --- Main execution block ---
# This is an example of a complete match with 8 players and 4 teams.
# Paste the content of your ArenaData.csv file here, between the triple quotes.
arena_data_content = """matchId,gameCreation,gameDurationMinutes,playerIndex,championName,championId,kills,deaths,assists,totalDamageDealt,totalDamageDealtToChampions,totalDamageTaken,goldEarned,placement,item1,item2,item3,item4,item5,item6,augment1,augment2,augment3,augment4,isWinner,level
NA1_5330318261,2025-07-22T11:03:28.000Z,26,1,TwistedFate,4,4,13,7,77260,38962,37013,15054,6,Hextech Gunblade,Runecarver,Nashor's Tooth,Cryptbloom,Rod of Ages,Lich Bane,Witchful Thinking,Big Brain,Clothesline,,0,17
NA1_5330318261,2025-07-22T11:03:28.000Z,26,2,Garen,86,18,6,5,216578,91399,35625,19262,1,The Collector,Iceborn Gauntlet,Galeforce,Phantom Dancer,Immortal Shieldbow,Mortal Reminder,Executioner,From Beginning to End,Blunt Force,Frost Wraith,1,18
NA1_5330318261,2025-07-22T11:03:28.000Z,26,3,Zyra,143,2,9,16,40785,35017,35380,12517,4,Hextech Gunblade,Malignance,Pyromancer's Cloak,Liandry's Anguish,The Golden Spatula,Rylai's Crystal Scepter,ADAPt,Quest: Urf's Champion,Ice Cold,Repulsor,0,17
NA1_5330318261,2025-07-22T11:03:28.000Z,26,4,Syndra,134,2,8,3,28103,17640,20421,7029,8,Guardian's Orb,Sorcerer's Shoes,Void Staff,Luden's Companion,Cosmic Drive,Sanguine Gift,Slap Around,Phenomenal Evil,,,0,13
NA1_5330318261,2025-07-22T11:03:28.000Z,26,5,Caitlyn,51,6,5,4,35833,32672,28350,11793,7,Hellfire Hatchet,Youmuu's Ghostblade,Edge of Night,Voltaic Cyclosword,Serpent's Fang,Opportunity,Homeguard,Stats on Stats!,Ocean Soul,,0,16
NA1_5330318261,2025-07-22T11:03:28.000Z,26,6,Briar,233,4,7,5,59939,20047,29141,10009,7,Darksteel Talons,Death's Dance,Hemomancer's Helm,Zephyr,Arcane Sweeper,,Leg Day,Firebrand,Scoped Weapons,,0,16
NA1_5330318261,2025-07-22T11:03:28.000Z,26,7,Swain,50,11,5,9,65896,46583,94188,13804,3,Riftmaker,Liandry's Anguish,Cloak of Starry Night,Morellonomicon,Rod of Ages,Seraph's Embrace,Mind to Matter,Bread And Butter,Ultimate Unstoppable,Juice Press,0,18
NA1_5330318261,2025-07-22T11:03:28.000Z,26,8,Chogath,31,3,6,2,16081,11240,29172,7012,8,Guardian's Horn,Mercury's Treads,Shield of Molten Stone,Fimbulwinter,Hollow Radiance,Spirit Visage,Frozen Foundations,Scopier Weapons,,,0,13
NA1_5330318261,2025-07-22T11:03:28.000Z,26,9,Swain,50,11,6,3,50336,39206,61839,10846,6,Guardian's Horn,Plated Steelcaps,Locket of the Iron Solari,"Jak'Sho, The Protean",Sunfire Aegis,Cloak of Starry Night,Desecrator,Bread And Jam,Buff Buddies,,0,16
NA1_5330318261,2025-07-22T11:03:28.000Z,26,10,Aurora,893,8,8,4,75042,56507,37340,14335,5,Everfrost,Zhonya's Hourglass,Liandry's Anguish,Rabadon's Deathcap,Void Staff,Shadowflame,Tank It Or Leave It,Quest: Urf's Champion,Shadow Runner,Firefox,0,17
NA1_5330318261,2025-07-22T11:03:28.000Z,26,11,Rell,526,5,9,7,17715,14187,32834,12808,5,Ionian Boots of Lucidity,"Jak'Sho, The Protean",Knight's Vow,Unending Despair,Hollow Radiance,Arcane Sweeper,Contract Killer,Impassable,Slap Around,Ocean Soul,0,17
NA1_5330318261,2025-07-22T11:03:28.000Z,26,12,Akali,84,17,6,2,100380,61113,45182,11515,4,Guardian's Orb,Sorcerer's Shoes,Hextech Rocketbelt,Innervating Locket,Rod of Ages,Rabadon's Deathcap,Don't Chase,Marksmage,Transmute: Gold,Goredrink,0,18
NA1_5330318261,2025-07-22T11:03:28.000Z,26,13,Mordekaiser,82,8,3,15,84365,51785,56995,16541,1,Rylai's Crystal Scepter,Liandry's Anguish,Dragonheart,Heartsteel,Unending Despair,Spirit Visage,Infernal Soul,Apex Inventor,Ultimate Unstoppable,Serve Beyond Death,1,18
NA1_5330318261,2025-07-22T11:03:28.000Z,26,14,Nocturne,56,9,12,9,66373,52993,41580,13772,3,Serylda's Grudge,Voltaic Cyclosword,Duskblade of Draktharr,Edge of Night,Opportunity,Hellfire Hatchet,Transmute: Gold,Shrink Ray,Deft,Numb to Pain,0,18
NA1_5330318261,2025-07-22T11:03:28.000Z,26,15,Malzahar,90,6,14,6,65573,43662,45825,18769,2,Seraph's Embrace,Rabadon's Deathcap,Pyromancer's Cloak,Blackfire Torch,Luden's Companion,Rylai's Crystal Scepter,Executioner,Big Brain,Fallen Aegis,Overflow,0,18
NA1_5330318261,2025-07-22T11:03:28.000Z,26,16,Nasus,75,9,6,5,88868,56348,83379,17262,2,Unending Despair,Gargoyle Stoneplate,Black Hole Gauntlet,Heartsteel,"Jak'Sho, The Protean",Sunfire Aegis,Tank Engine,Celestial Body,Heavy Hitter,Typhoon,0,18
"""
combined_df = combine_team_stats(arena_data_content)
